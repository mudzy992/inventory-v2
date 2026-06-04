import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { OrgUnit, OrgUnitType } from '../../../generated/prisma/client';
import { LocationResolutionService } from '../../common/services/location-resolution.service';
import { SignerResolutionService } from '../../common/services/signer-resolution.service';
import { OrgScopeService, type OrgUnitTreeNode } from '../../common/services/org-scope.service';
import { assertValidOrgUnitParentChild } from '../../common/utils/org-hierarchy-validation.util';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { CreateOrgUnitDto } from './dto/create-org-unit.dto';
import { UpdateOrgUnitDto } from './dto/update-org-unit.dto';

@Injectable()
export class OrgUnitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orgScopeService: OrgScopeService,
    private readonly locationResolutionService: LocationResolutionService,
    private readonly signerResolutionService: SignerResolutionService,
    private readonly settingsService: SettingsService,
  ) {}

  async findFlat(): Promise<OrgUnit[]> {
    return this.prisma.orgUnit.findMany({ orderBy: { name: 'asc' } });
  }

  async findTree(): Promise<OrgUnitTreeNode[]> {
    const units = await this.findFlat();
    return this.orgScopeService.buildOrgUnitTree(units);
  }

  async findOne(id: string): Promise<OrgUnit> {
    const unit = await this.prisma.orgUnit.findUnique({ where: { id } });
    if (!unit) {
      throw new NotFoundException('Org unit not found');
    }
    return unit;
  }

  async create(dto: CreateOrgUnitDto): Promise<OrgUnit> {
    await this.settingsService.assertFeatureEnabled('features.organization');
    if (dto.parentId) {
      const parent = await this.findOne(dto.parentId);
      assertValidOrgUnitParentChild(parent.type, dto.type);
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
    await this.refreshDerivedFields(unit.id);
    return this.findOne(unit.id);
  }

  async update(id: string, dto: UpdateOrgUnitDto): Promise<OrgUnit> {
    await this.settingsService.assertFeatureEnabled('features.organization');
    const existing = await this.findOne(id);
    const nextParentId = dto.parentId !== undefined ? dto.parentId : existing.parentId;
    const nextType = dto.type ?? existing.type;
    if (nextParentId) {
      if (nextParentId === id) {
        throw new BadRequestException('Org unit cannot be its own parent');
      }
      const parent = await this.findOne(nextParentId);
      await this.assertNoCycle(id, nextParentId);
      assertValidOrgUnitParentChild(parent.type, nextType);
      await this.assertChildrenCompatibleWithParentType(id, parent.type);
    }
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
    await this.refreshDerivedFields(id);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    const childCount = await this.prisma.orgUnit.count({ where: { parentId: id } });
    if (childCount > 0) {
      throw new BadRequestException('Cannot delete org unit with children');
    }
    const employeeCount = await this.prisma.employee.count({ where: { orgUnitId: id } });
    if (employeeCount > 0) {
      throw new BadRequestException('Cannot delete org unit with employees');
    }
    await this.prisma.orgUnit.delete({ where: { id } });
  }

  private async refreshDerivedFields(orgUnitId: string): Promise<void> {
    await this.locationResolutionService.refreshOrgUnitEffectiveLocations(orgUnitId);
    await this.signerResolutionService.refreshOrgUnitEffectiveSigners(orgUnitId);
  }

  private async assertChildrenCompatibleWithParentType(
    unitId: string,
    parentType: OrgUnitType,
  ): Promise<void> {
    const children = await this.prisma.orgUnit.findMany({
      where: { parentId: unitId },
      select: { id: true, type: true, name: true },
    });
    for (const child of children) {
      try {
        assertValidOrgUnitParentChild(parentType, child.type);
      } catch {
        throw new BadRequestException(
          `Child "${child.name}" (${child.type}) is not allowed under parent type "${parentType}"`,
        );
      }
    }
  }

  private async assertCityExists(cityId: string): Promise<void> {
    const city = await this.prisma.city.findUnique({ where: { id: cityId } });
    if (!city) {
      throw new BadRequestException('City not found');
    }
  }

  private async assertEmployeeExists(employeeId: string): Promise<void> {
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) {
      throw new BadRequestException('Signer employee not found');
    }
  }

  private async assertNoCycle(unitId: string, newParentId: string): Promise<void> {
    let currentId: string | null = newParentId;
    while (currentId) {
      if (currentId === unitId) {
        throw new BadRequestException('Parent assignment would create a cycle');
      }
      const parentRow: { parentId: string | null } | null = await this.prisma.orgUnit.findUnique({
        where: { id: currentId },
        select: { parentId: true },
      });
      currentId = parentRow?.parentId ?? null;
    }
  }
}
