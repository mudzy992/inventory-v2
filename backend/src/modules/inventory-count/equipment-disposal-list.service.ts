import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { LocationResolutionService } from '../../common/services/location-resolution.service';
import { OrgScopeService } from '../../common/services/org-scope.service';
import { RegistrarScopeService } from '../../common/services/registrar-scope.service';
import { WarehouseResolutionService } from '../../common/services/warehouse-resolution.service';
import { assertCanWriteEquipment } from '../equipment/equipment-access.util';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { DISPOSAL_MESSAGES } from '../../common/utils/disposal-messages.util';
import { assignListedDisposalItemsToCommissionInTx } from './utils/assign-disposal-list-to-commission.util';
import { isEquipmentEligibleForDisposalMark } from './utils/assert-disposal-warehouse-eligibility.util';
import {
  ACCOUNTING_TRACKED_EXCLUSION_MESSAGE,
  isDisposalEligible,
} from '../../common/utils/equipment-accounting-tracked.util';
import { resolveParentAssetCategoryIdInTx } from './utils/resolve-parent-asset-category.util';
import { buildCommitteeScopeDeps } from './utils/build-committee-scope-deps.util';
import { isEquipmentInDisposalSessionScope } from './utils/disposal-session-scope.util';

const LIST_ITEM_INCLUDE = {
  equipment: {
    select: {
      id: true,
      inventoryNumber: true,
      status: true,
      category: { select: { id: true, name: true } },
      warehouse: { select: { id: true, name: true } },
      currentHolder: { select: { id: true, firstName: true, lastName: true } },
    },
  },
  warehouse: { select: { id: true, name: true } },
  category: { select: { id: true, name: true } },
  markedByUser: { select: { id: true, username: true } },
  razduzenjeTransfer: { select: { id: true, status: true, documentNumber: true } },
  disposalCommission: { select: { id: true, name: true } },
} satisfies Prisma.EquipmentDisposalListItemInclude;

export interface MarkDisposalListInput {
  equipmentId: string;
  note?: string;
}

@Injectable()
export class EquipmentDisposalListService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registrarScope: RegistrarScopeService,
    private readonly locationResolutionService: LocationResolutionService,
    private readonly orgScopeService: OrgScopeService,
    private readonly warehouseResolutionService: WarehouseResolutionService,
    private readonly settingsService: SettingsService,
  ) {}

  private async assertPreListEnabled(): Promise<void> {
    await this.settingsService.assertFeatureEnabled('features.disposal_pre_list');
    await this.settingsService.assertFeatureEnabled('features.inventory_count');
  }

  async listForSession(user: AuthenticatedUser, sessionId: string) {
    await this.assertPreListEnabled();
    const session = await this.getSessionOrThrow(sessionId);
    await this.assertCanViewSessionList(user, session);
    const where = await this.buildListWhere(user, sessionId);
    return this.prisma.equipmentDisposalListItem.findMany({
      where,
      include: LIST_ITEM_INCLUDE,
      orderBy: { markedAt: 'desc' },
    });
  }

  async markForDisposal(user: AuthenticatedUser, sessionId: string, input: MarkDisposalListInput) {
    await this.assertPreListEnabled();
    const session = await this.getSessionOrThrow(sessionId);
    if (session.status !== 'draft') {
      throw new BadRequestException(
        'Oprema se može označiti za rashod samo dok je sesija popisa u nacrtu',
      );
    }
    const equipment = await this.prisma.equipment.findUnique({
      where: { id: input.equipmentId },
      include: {
        category: { select: { id: true, categoryKind: true } },
        currentHolder: true,
        warehouse: true,
      },
    });
    if (!equipment) {
      throw new NotFoundException('Equipment not found');
    }
    if (!isDisposalEligible(equipment)) {
      throw new BadRequestException(ACCOUNTING_TRACKED_EXCLUSION_MESSAGE);
    }
    if (equipment.status === 'rashodovano' || equipment.status === 'za_rashod') {
      throw new BadRequestException('Oprema je već označena ili rashodovana');
    }
    if (!isEquipmentEligibleForDisposalMark(equipment)) {
      throw new BadRequestException(DISPOSAL_MESSAGES.disposalRequiresWarehouse);
    }
    const trimmedNote = input.note?.trim() ?? '';
    if (trimmedNote.length < 3) {
      throw new BadRequestException(DISPOSAL_MESSAGES.disposalReasonRequired);
    }
    await assertCanWriteEquipment(
      user,
      equipment,
      equipment.currentHolder,
      this.registrarScope,
      this.prisma,
    );
    const existing = await this.prisma.equipmentDisposalListItem.findUnique({
      where: {
        sessionId_equipmentId: { sessionId, equipmentId: input.equipmentId },
      },
    });
    if (existing && existing.status !== 'withdrawn') {
      throw new BadRequestException('Oprema je već na listi za rashod u ovoj sesiji');
    }
    if (equipment.category.categoryKind !== 'ASSET') {
      throw new BadRequestException('Samo ASSET oprema može biti na listi za rashod');
    }
    const warehouseId = equipment.warehouseId!;
    const parentCategoryId = await resolveParentAssetCategoryIdInTx(
      this.prisma,
      equipment.categoryId,
    );
    const committeeSlot = await this.prisma.inventoryCommittee.findFirst({
      where: {
        sessionId,
        warehouseId,
        categoryId: parentCategoryId,
      },
      select: { id: true },
    });
    if (!committeeSlot) {
      throw new BadRequestException(
        'Nema definisanog opsega popisa za ovo skladište i kategoriju u odabranoj sesiji',
      );
    }
    const inScope = await isEquipmentInDisposalSessionScope(
      this.buildCommitteeScopeDeps(),
      {
        sessionOrgUnitId: session.orgUnitId,
        warehouseId,
        parentCategoryId,
      },
      equipment,
    );
    if (!inScope) {
      throw new BadRequestException('Oprema nije u opsegu sesije popisa');
    }
    return this.prisma.$transaction(async (tx) => {
      let listItem;
      if (existing?.status === 'withdrawn') {
        listItem = await tx.equipmentDisposalListItem.update({
          where: { id: existing.id },
          data: {
            status: 'listed',
            warehouseId,
            categoryId: parentCategoryId,
            note: trimmedNote,
            markedByUserId: user.id,
            markedAt: new Date(),
            withdrawnByUserId: null,
            withdrawnAt: null,
            withdrawalNote: null,
            razduzenjeTransferId: null,
            disposalCommissionId: null,
            approvalId: null,
          },
          include: LIST_ITEM_INCLUDE,
        });
      } else {
        listItem = await tx.equipmentDisposalListItem.create({
          data: {
            sessionId,
            equipmentId: input.equipmentId,
            warehouseId,
            categoryId: parentCategoryId,
            note: trimmedNote,
            markedByUserId: user.id,
          },
          include: LIST_ITEM_INCLUDE,
        });
      }
      await tx.equipment.update({
        where: { id: equipment.id },
        data: {
          status: 'za_rashod',
          warehouseId,
          currentHolderId: null,
        },
      });
      return listItem;
    });
  }

  async withdrawFromList(
    user: AuthenticatedUser,
    sessionId: string,
    equipmentId: string,
    note?: string,
  ) {
    await this.assertPreListEnabled();
    if (user.role !== 'admin') {
      throw new ForbiddenException(DISPOSAL_MESSAGES.removeAdminOnly);
    }
    const session = await this.getSessionOrThrow(sessionId);
    if (session.status !== 'draft') {
      throw new BadRequestException(DISPOSAL_MESSAGES.sessionNotDraft);
    }
    const item = await this.prisma.equipmentDisposalListItem.findUnique({
      where: { sessionId_equipmentId: { sessionId, equipmentId } },
    });
    if (!item) {
      throw new NotFoundException('Stavka nije na listi za rashod');
    }
    if (item.status !== 'listed') {
      throw new BadRequestException(DISPOSAL_MESSAGES.removeListedOnly);
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.equipmentDisposalListItem.update({
        where: { id: item.id },
        data: {
          status: 'withdrawn',
          withdrawnByUserId: user.id,
          withdrawnAt: new Date(),
          withdrawalNote: note?.trim() ?? null,
        },
        include: LIST_ITEM_INCLUDE,
      });
      await tx.equipment.update({
        where: { id: equipmentId },
        data: { status: 'skladiste' },
      });
      return updated;
    });
  }

  async assignListedItemsToCommitteeInTx(
    tx: Prisma.TransactionClient,
    input: {
      sessionId: string;
      warehouseId: string;
      parentCategoryId: string;
      disposalCommissionId: string;
    },
  ): Promise<number> {
    return assignListedDisposalItemsToCommissionInTx(tx, input);
  }

  async countUnassignedListed(sessionId: string): Promise<number> {
    return this.prisma.equipmentDisposalListItem.count({
      where: { sessionId, status: 'listed' },
    });
  }

  async findEligibleSessionsForEquipment(user: AuthenticatedUser, equipmentId: string) {
    await this.assertPreListEnabled();
    const equipment = await this.prisma.equipment.findUnique({
      where: { id: equipmentId },
      include: {
        category: { select: { id: true, categoryKind: true } },
        currentHolder: true,
        warehouse: { select: { id: true, cityId: true } },
      },
    });
    if (!equipment) {
      throw new NotFoundException('Equipment not found');
    }
    if (equipment.status === 'rashodovano' || equipment.status === 'za_rashod') {
      return [];
    }
    if (!isEquipmentEligibleForDisposalMark(equipment)) {
      return [];
    }
    if (equipment.category.categoryKind !== 'ASSET') {
      return [];
    }
    const warehouseId = equipment.warehouseId!;
    const parentCategoryId = await resolveParentAssetCategoryIdInTx(
      this.prisma,
      equipment.categoryId,
    );
    const draftSessions = await this.prisma.inventorySession.findMany({
      where: { status: 'draft' },
      include: {
        orgUnit: { select: { id: true, name: true } },
      },
      orderBy: [{ year: 'desc' }, { createdAt: 'desc' }],
    });
    const eligible = [];
    for (const session of draftSessions) {
      const slot = await this.prisma.inventoryCommittee.findFirst({
        where: {
          sessionId: session.id,
          warehouseId,
          categoryId: parentCategoryId,
        },
        select: { id: true },
      });
      if (!slot) {
        continue;
      }
      const inScope = await isEquipmentInDisposalSessionScope(
        this.buildCommitteeScopeDeps(),
        {
          sessionOrgUnitId: session.orgUnitId,
          warehouseId,
          parentCategoryId,
        },
        equipment,
      );
      if (!inScope) {
        continue;
      }
      eligible.push({
        id: session.id,
        name: session.name,
        year: session.year,
        status: session.status,
        orgUnitId: session.orgUnitId,
        orgUnit: session.orgUnit,
      });
    }
    return eligible;
  }

  private async getSessionOrThrow(sessionId: string) {
    const session = await this.prisma.inventorySession.findUnique({
      where: { id: sessionId },
      include: { orgUnit: true },
    });
    if (!session) {
      throw new NotFoundException('Inventory session not found');
    }
    return session;
  }

  private async assertCanViewSessionList(
    user: AuthenticatedUser,
    session: { id: string; orgUnitId: string },
  ): Promise<void> {
    if (user.role === 'admin') {
      return;
    }
    if (user.role === 'evidenticar') {
      const cityId = await this.locationResolutionService.getEffectiveLocationForOrgUnit(
        session.orgUnitId,
      );
      const scopedCityIds = await this.registrarScope.getScopedCityIds(user);
      if (scopedCityIds === null || (cityId && scopedCityIds.has(cityId))) {
        return;
      }
    }
    throw new ForbiddenException('Nemate pristup listi za rashod ove sesije');
  }

  private async buildListWhere(
    user: AuthenticatedUser,
    sessionId: string,
  ): Promise<Prisma.EquipmentDisposalListItemWhereInput> {
    if (user.role === 'admin') {
      return { sessionId };
    }
    const equipmentWhere = await this.registrarScope.buildEquipmentWhere(user);
    return {
      sessionId,
      equipment: equipmentWhere,
    };
  }

  private buildCommitteeScopeDeps() {
    return buildCommitteeScopeDeps(
      this.prisma,
      this.locationResolutionService,
      this.registrarScope,
      this.orgScopeService,
      this.warehouseResolutionService,
      (equipment) => this.resolveEquipmentCityId(equipment),
    );
  }

  private async resolveEquipmentCityId(equipment: {
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
}
