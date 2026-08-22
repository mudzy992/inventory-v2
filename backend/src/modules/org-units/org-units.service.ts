import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { OrgUnit, OrgUnitType } from '../../../generated/prisma/client';
import { LocationResolutionService } from '../../common/services/location-resolution.service';
import { ModeratorScopeService } from '../../common/services/moderator-scope.service';
import { SignerResolutionService } from '../../common/services/signer-resolution.service';
import { OrgScopeService, type OrgUnitTreeNode } from '../../common/services/org-scope.service';
import { ORG_HIERARCHY_MESSAGES } from '../../common/utils/org-hierarchy-messages.util';
import { assertValidOrgUnitParentChild } from '../../common/utils/org-hierarchy-validation.util';
import { AUTOCOMPLETE_SEARCH_LIMIT } from '../../common/dto/autocomplete-search-query.dto';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { CreateOrgUnitDto } from './dto/create-org-unit.dto';
import { SearchOrgUnitsQueryDto } from './dto/search-org-units-query.dto';
import { UpdateOrgUnitDto } from './dto/update-org-unit.dto';

const ORG_UNIT_SIGNER_EMPLOYEE_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  title: true,
} as const;

const ORG_UNIT_FLAT_INCLUDE = {
  effectiveSigner: { select: ORG_UNIT_SIGNER_EMPLOYEE_SELECT },
  signer: { select: ORG_UNIT_SIGNER_EMPLOYEE_SELECT },
} as const;

@Injectable()
export class OrgUnitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orgScopeService: OrgScopeService,
    private readonly moderatorScope: ModeratorScopeService,
    private readonly locationResolutionService: LocationResolutionService,
    private readonly signerResolutionService: SignerResolutionService,
    private readonly settingsService: SettingsService,
  ) {}

  async findFlat(user: AuthenticatedUser): Promise<OrgUnit[]> {
    const scopedWhere = await this.moderatorScope.buildScopedOrgUnitWhere(user);
    return this.prisma.orgUnit.findMany({
      where: scopedWhere ?? undefined,
      orderBy: { name: 'asc' },
      include: ORG_UNIT_FLAT_INCLUDE,
    });
  }

  async search(user: AuthenticatedUser, query: SearchOrgUnitsQueryDto): Promise<OrgUnit[]> {
    const term = query.q.trim();
    const limit = Math.min(query.limit ?? AUTOCOMPLETE_SEARCH_LIMIT, AUTOCOMPLETE_SEARCH_LIMIT);
    const scopedWhere = await this.moderatorScope.buildScopedOrgUnitWhere(user);
    return this.prisma.orgUnit.findMany({
      where: {
        name: { contains: term, mode: 'insensitive' },
        ...(scopedWhere ?? {}),
      },
      orderBy: { name: 'asc' },
      take: limit,
    });
  }

  async findTree(user: AuthenticatedUser): Promise<OrgUnitTreeNode[]> {
    const units = await this.findFlat(user);
    return this.orgScopeService.buildOrgUnitTree(units);
  }

  async findOne(user: AuthenticatedUser, id: string): Promise<OrgUnit> {
    const unit = await this.prisma.orgUnit.findUnique({ where: { id } });
    if (!unit) {
      throw new NotFoundException(ORG_HIERARCHY_MESSAGES.notFound);
    }
    await this.moderatorScope.assertOrgUnitInScope(user, id);
    return unit;
  }

  async countEquipmentInSubtree(user: AuthenticatedUser, orgUnitId: string): Promise<{ count: number }> {
    await this.findOne(user, orgUnitId);
    const subtreeIds = await this.orgScopeService.expandOrgUnitIds([orgUnitId]);
    const assignedCount = await this.prisma.equipment.count({
      where: {
        status: 'zaduzeno',
        currentHolder: { orgUnitId: { in: subtreeIds } },
      },
    });
    const warehouseRows = await this.prisma.warehouse.findMany({
      where: { orgUnitId: { in: subtreeIds } },
      select: { id: true },
    });
    const warehouseIds = warehouseRows.map((row) => row.id);
    const warehouseEquipmentCount =
      warehouseIds.length > 0
        ? await this.prisma.equipment.count({
            where: { warehouseId: { in: warehouseIds } },
          })
        : 0;
    return { count: assignedCount + warehouseEquipmentCount };
  }

  async create(user: AuthenticatedUser, dto: CreateOrgUnitDto): Promise<OrgUnit> {
    await this.assertModeratorWrites(user);
    await this.settingsService.assertFeatureEnabled('features.organization');
    if (dto.parentId) {
      await this.moderatorScope.assertOrgUnitInScope(user, dto.parentId);
      const parent = await this.findOne(user, dto.parentId);
      assertValidOrgUnitParentChild(parent.type, dto.type);
    } else if (this.moderatorScope.isModerator(user)) {
      throw new BadRequestException('Moderator mora odabrati parent org jedinicu');
    }
    if (dto.signerId) {
      await this.assertEmployeeExists(dto.signerId);
    }
    if (dto.locationCityId) {
      await this.assertCityExists(dto.locationCityId);
    }
    const unit = await this.prisma.orgUnit.create({
      data: {
        name: dto.name,
        type: dto.type,
        parentId: dto.parentId ?? null,
        signerId: dto.signerId ?? null,
        locationCityId: dto.locationCityId ?? null,
      },
    });
    await this.refreshDerivedFields(unit.id, {
      refreshSigner: true,
      refreshLocation: true,
    });
    return this.findOne(user, unit.id);
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateOrgUnitDto): Promise<OrgUnit> {
    await this.assertModeratorWrites(user);
    await this.settingsService.assertFeatureEnabled('features.organization');
    const existing = await this.findOne(user, id);
    const nextParentId = dto.parentId !== undefined ? dto.parentId : existing.parentId;
    const nextType = dto.type ?? existing.type;
    if (nextParentId) {
      if (nextParentId === id) {
        throw new BadRequestException(ORG_HIERARCHY_MESSAGES.selfParent);
      }
      await this.moderatorScope.assertOrgUnitInScope(user, nextParentId);
      const parent = await this.findOne(user, nextParentId);
      await this.assertNoCycle(id, nextParentId);
      assertValidOrgUnitParentChild(parent.type, nextType);
    }
    await this.assertDirectChildrenCompatibleWithUnitType(id, nextType);
    if (dto.signerId) {
      await this.assertEmployeeExists(dto.signerId);
    }
    if (dto.locationCityId) {
      await this.assertCityExists(dto.locationCityId);
    }
    await this.prisma.orgUnit.update({
      where: { id },
      data: {
        name: dto.name,
        type: dto.type,
        parentId: dto.parentId,
        signerId: dto.signerId,
        locationCityId: dto.locationCityId,
      },
    });
    const parentChanged =
      dto.parentId !== undefined && dto.parentId !== existing.parentId;
    const signerChanged =
      dto.signerId !== undefined && dto.signerId !== existing.signerId;
    const locationChanged =
      dto.locationCityId !== undefined && dto.locationCityId !== existing.locationCityId;
    await this.refreshDerivedFields(id, {
      refreshSigner: signerChanged || parentChanged,
      refreshLocation: locationChanged || parentChanged,
    });
    return this.findOne(user, id);
  }

  async remove(user: AuthenticatedUser, id: string): Promise<void> {
    await this.assertModeratorWrites(user);
    await this.findOne(user, id);
    const childCount = await this.prisma.orgUnit.count({ where: { parentId: id } });
    if (childCount > 0) {
      throw new BadRequestException(ORG_HIERARCHY_MESSAGES.deleteHasChildren);
    }
    const employeeCount = await this.prisma.employee.count({ where: { orgUnitId: id } });
    if (employeeCount > 0) {
      throw new BadRequestException(ORG_HIERARCHY_MESSAGES.deleteHasEmployees);
    }
    await this.prisma.orgUnit.delete({ where: { id } });
  }

  private async assertModeratorWrites(user: AuthenticatedUser): Promise<void> {
    if (this.moderatorScope.isModerator(user)) {
      await this.settingsService.assertFeatureEnabled(
        'features.moderator_role',
        'Uloga moderatora je onemogućena u postavkama',
      );
    }
  }

  private async refreshDerivedFields(
    orgUnitId: string,
    options: { refreshSigner: boolean; refreshLocation: boolean },
  ): Promise<void> {
    const tasks: Promise<void>[] = [];
    if (options.refreshLocation) {
      tasks.push(this.locationResolutionService.refreshOrgUnitEffectiveLocations(orgUnitId));
    }
    if (options.refreshSigner) {
      tasks.push(this.signerResolutionService.refreshOrgUnitEffectiveSigners(orgUnitId));
    }
    if (tasks.length > 0) {
      await Promise.all(tasks);
    }
  }

  private async assertDirectChildrenCompatibleWithUnitType(
    unitId: string,
    unitType: OrgUnitType,
  ): Promise<void> {
    const children = await this.prisma.orgUnit.findMany({
      where: { parentId: unitId },
      select: { id: true, type: true, name: true },
    });
    for (const child of children) {
      try {
        assertValidOrgUnitParentChild(unitType, child.type);
      } catch {
        throw new BadRequestException(
          ORG_HIERARCHY_MESSAGES.childIncompatible(child.name, child.type, unitType),
        );
      }
    }
  }

  private async assertCityExists(cityId: string): Promise<void> {
    const city = await this.prisma.city.findUnique({ where: { id: cityId } });
    if (!city) {
      throw new BadRequestException(ORG_HIERARCHY_MESSAGES.cityNotFound);
    }
  }

  private async assertEmployeeExists(employeeId: string): Promise<void> {
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) {
      throw new BadRequestException(ORG_HIERARCHY_MESSAGES.signerNotFound);
    }
  }

  private async assertNoCycle(unitId: string, newParentId: string): Promise<void> {
    let currentId: string | null = newParentId;
    while (currentId) {
      if (currentId === unitId) {
        throw new BadRequestException(ORG_HIERARCHY_MESSAGES.cycle);
      }
      const parentRow: { parentId: string | null } | null = await this.prisma.orgUnit.findUnique({
        where: { id: currentId },
        select: { parentId: true },
      });
      currentId = parentRow?.parentId ?? null;
    }
  }
}
