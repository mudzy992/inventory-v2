import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import {
  buildContainsSearchWhere,
  buildOrderBy,
  paginate,
  parsePagination,
  resolveListPageSize,
} from '../../common/utils/pagination.util';
import { LocationResolutionService } from '../../common/services/location-resolution.service';
import { OrgScopeService } from '../../common/services/org-scope.service';
import { RegistrarScopeService } from '../../common/services/registrar-scope.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { ListDisposalCommissionsQueryDto } from './dto/list-disposal-commissions-query.dto';

const COMMISSION_LIST_INCLUDE = {
  city: { include: { canton: true } },
  members: { include: { employee: true } },
} satisfies Prisma.DisposalCommissionInclude;

const COMMISSION_SORT_FIELDS: Record<string, string> = {
  name: 'name',
  createdAt: 'createdAt',
};
import type { DisposalCommissionMember, InventoryCommittee } from '../../../generated/prisma/client';
import {
  evaluateEquipmentInCommitteeScope,
  type WarehouseScopeEquipment,
} from '../inventory-count/utils/resolve-warehouse-committee-scope.util';

interface MemberInput {
  employeeId: string;
  role: 'predsjednik' | 'clan';
}

@Injectable()
export class DisposalCommissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly locationResolutionService: LocationResolutionService,
    private readonly registrarScope: RegistrarScopeService,
    private readonly orgScopeService: OrgScopeService,
    private readonly settingsService: SettingsService,
  ) {}

  private async assertDisposalCommissionsEnabled(): Promise<void> {
    await this.settingsService.assertFeatureEnabled('features.disposal_commissions');
  }

  async findAll(query: ListDisposalCommissionsQueryDto) {
    await this.assertDisposalCommissionsEnabled();
    const { pageSize, maxPageSize } = await resolveListPageSize(query.pageSize, this.settingsService);
    const { page, take } = parsePagination(query, { defaultPageSize: pageSize, maxPageSize });
    const filters: Prisma.DisposalCommissionWhereInput[] = [{ isActive: true }];
    if (query.cityId) {
      filters.push({ cityId: query.cityId });
    }
    const searchWhere = buildContainsSearchWhere(query.search, ['name']);
    if (searchWhere) {
      filters.push(searchWhere);
    }
    const where: Prisma.DisposalCommissionWhereInput =
      filters.length === 1 ? filters[0]! : { AND: filters };
    const orderBy = buildOrderBy(query.sortBy, query.sortDir, COMMISSION_SORT_FIELDS, 'name');
    return paginate({
      findMany: (args) =>
        this.prisma.disposalCommission.findMany({
          ...args,
          include: COMMISSION_LIST_INCLUDE,
        }),
      count: (args) => this.prisma.disposalCommission.count(args),
      where,
      orderBy,
      page,
      pageSize: take,
    });
  }

  async create(_cityId: string, _name: string, _members: MemberInput[]) {
    await this.assertDisposalCommissionsEnabled();
    throw new BadRequestException(
      'Komisija za rashod se kreira isključivo uz popisnu komisiju u sesiji inventure',
    );
  }

  async findOne(id: string) {
    await this.assertDisposalCommissionsEnabled();
    const commission = await this.prisma.disposalCommission.findUnique({
      where: { id },
      include: {
        city: { include: { canton: true } },
        members: { include: { employee: true } },
      },
    });
    if (!commission) {
      throw new NotFoundException('Disposal commission not found');
    }
    return commission;
  }

  async resolveForEquipment(equipmentId: string) {
    await this.assertDisposalCommissionsEnabled();
    const equipment = await this.prisma.equipment.findUnique({
      where: { id: equipmentId },
      include: { currentHolder: true, warehouse: true },
    });
    if (!equipment) {
      throw new NotFoundException('Equipment not found');
    }
    const cityId = await this.resolveCityIdForEquipment(equipment);
    if (!cityId) {
      throw new BadRequestException('Cannot resolve city for equipment');
    }
    const commission = await this.findCommissionForCityAndEquipment(cityId, equipmentId);
    return {
      cityId,
      city: commission?.city,
      commission,
    };
  }

  async findPendingApprovals(user: AuthenticatedUser) {
    await this.assertDisposalCommissionsEnabled();
    const approvals = await this.prisma.disposalApproval.findMany({
      where: { status: 'pending' },
      include: {
        transfer: {
          include: {
            equipment: { include: { currentHolder: true } },
          },
        },
        votes: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (user.role === 'admin') {
      return approvals;
    }
    const voter = await this.prisma.user.findUnique({ where: { id: user.id } });
    if (!voter?.employeeId) {
      return [];
    }
    const result = [];
    for (const approval of approvals) {
      const commission = await this.findCommissionForTransfer(approval.transfer);
      const isMember = commission.members.some(
        (row: DisposalCommissionMember) => row.employeeId === voter.employeeId,
      );
      if (isMember) {
        result.push(approval);
      }
    }
    return result;
  }

  async vote(user: AuthenticatedUser, approvalId: string, approved: boolean, note?: string) {
    await this.assertDisposalCommissionsEnabled();
    const approval = await this.prisma.disposalApproval.findUnique({
      where: { id: approvalId },
      include: {
        transfer: { include: { equipment: { include: { currentHolder: true, warehouse: true } } } },
        votes: true,
      },
    });
    if (!approval) {
      throw new NotFoundException('Approval not found');
    }
    if (approval.status !== 'pending') {
      throw new BadRequestException('Approval already finalized');
    }
    const commission = await this.findCommissionForTransfer(approval.transfer);
    const memberEmployeeIds = commission.members.map((row: DisposalCommissionMember) => row.employeeId);
    const voter = await this.prisma.user.findUnique({ where: { id: user.id } });
    const isMember = Boolean(voter?.employeeId && memberEmployeeIds.includes(voter.employeeId));
    if (!isMember && user.role !== 'admin') {
      throw new ForbiddenException('Not a commission member');
    }
    await this.prisma.disposalApprovalVote.upsert({
      where: { approvalId_userId: { approvalId, userId: user.id } },
      create: { approvalId, userId: user.id, approved, note },
      update: { approved, note },
    });
    await this.recalculateApproval(approvalId);
    return this.prisma.disposalApproval.findUnique({
      where: { id: approvalId },
      include: { votes: true, transfer: true },
    });
  }

  async assertCanSignDisposalTransfer(transferId: string): Promise<void> {
    const approval = await this.prisma.disposalApproval.findUnique({ where: { transferId } });
    if (!approval) {
      return;
    }
    if (approval.status !== 'approved') {
      throw new BadRequestException('Disposal commission approval required before signing');
    }
  }

  async createApprovalForTransfer(transferId: string, cityId: string): Promise<void> {
    await this.assertDisposalCommissionsEnabled();
    const commission = await this.prisma.disposalCommission.findFirst({
      where: { cityId, isActive: true },
      include: { members: true },
    });
    if (!commission || commission.members.length === 0) {
      throw new BadRequestException('No active disposal commission for this city');
    }
    await this.prisma.disposalApproval.create({
      data: { transferId, status: 'pending' },
    });
  }

  private async recalculateApproval(approvalId: string): Promise<void> {
    const approval = await this.prisma.disposalApproval.findUnique({
      where: { id: approvalId },
      include: {
        votes: true,
        transfer: { include: { equipment: { include: { currentHolder: true, warehouse: true } } } },
      },
    });
    if (!approval) {
      return;
    }
    const commission = await this.findCommissionForTransfer(approval.transfer);
    const memberUserIds = await this.prisma.user.findMany({
      where: {
        employeeId: { in: commission.members.map((row: DisposalCommissionMember) => row.employeeId) },
        isActive: true,
      },
      select: { id: true },
    });
    const requiredCount = memberUserIds.length;
    const votes = approval.votes;
    if (votes.some((vote) => !vote.approved)) {
      await this.prisma.disposalApproval.update({
        where: { id: approvalId },
        data: { status: 'rejected' },
      });
      return;
    }
    if (votes.filter((vote) => vote.approved).length >= requiredCount && requiredCount > 0) {
      await this.prisma.disposalApproval.update({
        where: { id: approvalId },
        data: { status: 'approved' },
      });
    }
  }

  private async findCommissionForTransfer(transfer: {
    equipmentId: string;
    equipment: {
      currentHolder: { orgUnitId: string } | null;
      warehouse?: { cityId: string } | null;
      warehouseId?: string | null;
    };
  }) {
    const cityId = await this.resolveCityIdForEquipment(transfer.equipment);
    if (!cityId) {
      throw new BadRequestException('Cannot resolve city for disposal approval');
    }
    const commission = await this.findCommissionForCityAndEquipment(cityId, transfer.equipmentId);
    if (!commission) {
      throw new BadRequestException('No disposal commission configured for city');
    }
    return commission;
  }

  private async findCommissionForCityAndEquipment(cityId: string, equipmentId: string) {
    const activeSession = await this.prisma.inventorySession.findFirst({
      where: { status: 'active', orgUnit: { effectiveLocationCityId: cityId } },
      include: {
        committees: {
          include: {
            disposalCommission: {
              include: {
                city: { include: { canton: true } },
                members: { include: { employee: true } },
              },
            },
          },
        },
      },
      orderBy: { year: 'desc' },
    });
    if (activeSession?.committees?.length) {
      for (const committee of activeSession.committees) {
        if (!committee.disposalCommission) {
          continue;
        }
        const inScope = await this.isEquipmentInCommitteeScope(committee, equipmentId);
        if (inScope) {
          return committee.disposalCommission;
        }
      }
    }
    return this.prisma.disposalCommission.findFirst({
      where: {
        cityId,
        isActive: true,
        inventoryCommittee: { isNot: null },
      },
      include: {
        city: { include: { canton: true } },
        members: { include: { employee: true } },
        inventoryCommittee: true,
      },
    });
  }

  private async isEquipmentInCommitteeScope(
    committee: Pick<InventoryCommittee, 'id' | 'categoryId' | 'warehouseId' | 'sessionId'>,
    equipmentId: string,
  ): Promise<boolean> {
    const equipment = await this.prisma.equipment.findUnique({
      where: { id: equipmentId },
      include: { currentHolder: true, warehouse: true, category: true },
    });
    if (!equipment) {
      return false;
    }
    const session = await this.prisma.inventorySession.findUnique({
      where: { id: committee.sessionId },
      select: { orgUnitId: true },
    });
    if (!session) {
      return false;
    }
    if (!committee.warehouseId) {
      return this.isEquipmentInLegacyCommitteeScope(committee.categoryId, session.orgUnitId, equipment);
    }
    return evaluateEquipmentInCommitteeScope(
      {
        expandCategoryIds: (categoryIds) => this.registrarScope.expandCategoryIds(categoryIds),
        resolveEquipmentCityId: (row) => this.resolveCityIdForEquipment(row),
        getEffectiveLocationForOrgUnit: (orgUnitId) =>
          this.locationResolutionService.getEffectiveLocationForOrgUnit(orgUnitId),
        getWarehouseCityId: async (warehouseId) => {
          const row = await this.prisma.warehouse.findUnique({
            where: { id: warehouseId },
            select: { cityId: true },
          });
          return row?.cityId ?? null;
        },
        expandOrgUnitIds: (rootIds) => this.orgScopeService.expandOrgUnitIds(rootIds),
        getWarehouseOrgUnitId: async (warehouseId) => {
          const row = await this.prisma.warehouse.findUnique({
            where: { id: warehouseId },
            select: { orgUnitId: true },
          });
          return row?.orgUnitId ?? null;
        },
      },
      {
        categoryId: committee.categoryId,
        warehouseId: committee.warehouseId,
        sessionOrgUnitId: session.orgUnitId,
      },
      equipment as WarehouseScopeEquipment,
    );
  }

  private async isEquipmentInLegacyCommitteeScope(
    categoryId: string,
    sessionOrgUnitId: string,
    equipment: {
      categoryId: string;
      status: string;
      currentHolder: { orgUnitId: string } | null;
      warehouse?: { cityId: string } | null;
      warehouseId?: string | null;
    },
  ): Promise<boolean> {
    if (equipment.status === 'rashodovano' || equipment.status === 'za_rashod') {
      return false;
    }
    const expanded = await this.registrarScope.expandCategoryIds([categoryId]);
    if (!expanded.has(equipment.categoryId)) {
      return false;
    }
    const cityId = await this.resolveCityIdForEquipment(equipment);
    const sessionCityId = await this.locationResolutionService.getEffectiveLocationForOrgUnit(
      sessionOrgUnitId,
    );
    return Boolean(cityId && sessionCityId && cityId === sessionCityId);
  }

  private async resolveCityIdForEquipment(equipment: {
    currentHolder: { orgUnitId: string } | null;
    warehouse?: { cityId: string } | null;
    warehouseId?: string | null;
  }): Promise<string | null> {
    if (equipment.currentHolder) {
      return this.locationResolutionService.getEffectiveLocationForOrgUnit(
        equipment.currentHolder.orgUnitId,
      );
    }
    if (equipment.warehouse) {
      return equipment.warehouse.cityId;
    }
    if (equipment.warehouseId) {
      const warehouse = await this.prisma.warehouse.findUnique({
        where: { id: equipment.warehouseId },
        select: { cityId: true },
      });
      return warehouse?.cityId ?? null;
    }
    return null;
  }

  private async replaceMembers(commissionId: string, members: MemberInput[]): Promise<void> {
    await this.prisma.disposalCommissionMember.deleteMany({ where: { commissionId } });
    if (members.length === 0) {
      return;
    }
    await this.prisma.disposalCommissionMember.createMany({
      data: members.map((member) => ({
        commissionId,
        employeeId: member.employeeId,
        role: member.role,
      })),
    });
  }
}
