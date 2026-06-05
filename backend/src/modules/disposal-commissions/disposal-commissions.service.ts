import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { LocationResolutionService } from '../../common/services/location-resolution.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import type { DisposalCommissionMember, InventoryCommittee } from '../../../generated/prisma/client';

interface MemberInput {
  employeeId: string;
  role: 'predsjednik' | 'clan';
}

@Injectable()
export class DisposalCommissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly locationResolutionService: LocationResolutionService,
    private readonly settingsService: SettingsService,
  ) {}

  private async assertDisposalCommissionsEnabled(): Promise<void> {
    await this.settingsService.assertFeatureEnabled('features.disposal_commissions');
  }

  async findAll(cityId?: string) {
    await this.assertDisposalCommissionsEnabled();
    return this.prisma.disposalCommission.findMany({
      where: cityId ? { cityId, isActive: true } : { isActive: true },
      include: {
        city: { include: { canton: true } },
        members: { include: { employee: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async create(cityId: string, name: string, members: MemberInput[]) {
    await this.assertDisposalCommissionsEnabled();
    const city = await this.prisma.city.findUnique({ where: { id: cityId } });
    if (!city) {
      throw new BadRequestException('City not found');
    }
    const existing = await this.prisma.disposalCommission.findFirst({
      where: { cityId, isActive: true },
    });
    if (existing) {
      throw new BadRequestException('Active disposal commission already exists for this city');
    }
    const commission = await this.prisma.disposalCommission.create({
      data: { cityId, name, isActive: true },
    });
    await this.replaceMembers(commission.id, members);
    return this.findOne(commission.id);
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
      where: { cityId, isActive: true, inventoryCommittee: { is: null } },
      include: {
        city: { include: { canton: true } },
        members: { include: { employee: true } },
      },
    });
  }

  private async isEquipmentInCommitteeScope(
    committee: Pick<InventoryCommittee, 'id' | 'categoryId' | 'sessionId'>,
    equipmentId: string,
  ): Promise<boolean> {
    const equipment = await this.prisma.equipment.findUnique({
      where: { id: equipmentId },
      include: { currentHolder: true, warehouse: true },
    });
    if (!equipment || equipment.status === 'rashodovano') {
      return false;
    }
    const session = await this.prisma.inventorySession.findUnique({
      where: { id: committee.sessionId },
      select: { orgUnitId: true },
    });
    if (!session) {
      return false;
    }
    const categoryRows = await this.prisma.category.findMany({ select: { id: true, parentId: true } });
    const childrenByParent = new Map<string | null, string[]>();
    for (const row of categoryRows) {
      const siblings = childrenByParent.get(row.parentId) ?? [];
      siblings.push(row.id);
      childrenByParent.set(row.parentId, siblings);
    }
    const expanded = new Set<string>();
    const visit = (categoryId: string): void => {
      if (expanded.has(categoryId)) {
        return;
      }
      expanded.add(categoryId);
      for (const childId of childrenByParent.get(categoryId) ?? []) {
        visit(childId);
      }
    };
    visit(committee.categoryId);
    if (!expanded.has(equipment.categoryId)) {
      return false;
    }
    const cityId = await this.resolveCityIdForEquipment(equipment);
    const sessionCityId = await this.locationResolutionService.getEffectiveLocationForOrgUnit(
      session.orgUnitId,
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
