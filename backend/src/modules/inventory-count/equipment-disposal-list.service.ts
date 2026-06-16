import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { LocationResolutionService } from '../../common/services/location-resolution.service';
import { RegistrarScopeService } from '../../common/services/registrar-scope.service';
import { WarehouseResolutionService } from '../../common/services/warehouse-resolution.service';
import { assertCanWriteEquipment } from '../equipment/equipment-access.util';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { DISPOSAL_MESSAGES } from '../../common/utils/disposal-messages.util';
import { isTransferCreationAllowed } from '../transfers/utils/transfer-generation-policy.util';
import { assignListedDisposalItemsToCommissionInTx } from './utils/assign-disposal-list-to-commission.util';
import { executeRazduzenjeForDisposalMarkInTx } from './utils/execute-disposal-mark-razduzenje.util';
import { resolveParentAssetCategoryIdInTx } from './utils/resolve-parent-asset-category.util';
import { resolveDisposalTargetWarehouseId } from './utils/resolve-disposal-target-warehouse.util';

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
  signerId?: string;
}

@Injectable()
export class EquipmentDisposalListService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registrarScope: RegistrarScopeService,
    private readonly locationResolutionService: LocationResolutionService,
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
    if (equipment.status === 'rashodovano' || equipment.status === 'za_rashod') {
      throw new BadRequestException('Oprema je već označena ili rashodovana');
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
    const warehouseId = await this.resolveTargetWarehouseId(user, equipment);
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
    if (equipment.status === 'zaduzeno') {
      const sessionCityId = await this.locationResolutionService.getEffectiveLocationForOrgUnit(
        session.orgUnitId,
      );
      const equipmentCityId = equipment.currentHolder
        ? await this.locationResolutionService.getEffectiveLocationForOrgUnit(
            equipment.currentHolder.orgUnitId,
          )
        : null;
      if (!sessionCityId || equipmentCityId !== sessionCityId) {
        throw new BadRequestException('Oprema nije u opsegu sesije popisa');
      }
    }
    const createTransfer = await isTransferCreationAllowed(
      this.settingsService,
      'razduzenje',
      'api',
    );
    const finalizeWithoutUpload =
      (await this.settingsService.getBooleanValue('transfer.allow_finalize_without_upload', false)) ||
      !(await this.settingsService.getBooleanValue('transfer.require_signed_pdf_upload', true));
    const signerId = input.signerId ?? (await this.getDefaultSignerId());
    return this.prisma.$transaction(async (tx) => {
      let razduzenjeTransferId: string | null = null;
      if (equipment.status === 'zaduzeno') {
        if (!equipment.currentHolderId) {
          throw new BadRequestException('Zadužena oprema nema nosioca');
        }
        const razduzenje = await executeRazduzenjeForDisposalMarkInTx(tx, {
          equipmentId: equipment.id,
          fromPersonId: equipment.currentHolderId,
          toWarehouseId: warehouseId,
          actorUserId: user.id,
          signerId,
          reason: 'Razduženje pri označavanju za rashod',
          createTransferDocument: createTransfer,
          finalizeWithoutUpload,
        });
        razduzenjeTransferId = razduzenje.transferId;
        if (!razduzenje.finalized) {
          throw new BadRequestException(
            `Potrebno je finalizirati prenosnicu razduženja prije dodavanja na listu (transfer ${razduzenje.transferId})`,
          );
        }
      } else if (equipment.status === 'skladiste') {
        if (equipment.warehouseId !== warehouseId) {
          await tx.equipment.update({
            where: { id: equipment.id },
            data: { warehouseId },
          });
        }
      } else {
        throw new BadRequestException('Nepodržan status opreme za listu rashoda');
      }
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
            razduzenjeTransferId,
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
            razduzenjeTransferId,
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
    if (equipment.category.categoryKind !== 'ASSET') {
      return [];
    }
    const warehouseId = await this.resolveEquipmentWarehouseIdForDisposal(user, equipment);
    if (!warehouseId) {
      return [];
    }
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

  private async resolveEquipmentWarehouseIdForDisposal(
    user: AuthenticatedUser,
    equipment: {
      id: string;
      categoryId: string;
      status: string;
      warehouseId: string | null;
      stockLotId: string | null;
      currentHolderId: string | null;
      currentHolder: { id: string; orgUnitId: string } | null;
    },
  ): Promise<string | null> {
    return this.resolveDisposalWarehouseId(user, equipment);
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

  private async resolveTargetWarehouseId(
    user: AuthenticatedUser,
    equipment: {
      id: string;
      categoryId: string;
      status: string;
      warehouseId: string | null;
      stockLotId: string | null;
      currentHolderId: string | null;
      currentHolder: { id: string; orgUnitId: string } | null;
    },
  ): Promise<string> {
    const warehouseId = await this.resolveDisposalWarehouseId(user, equipment);
    if (!warehouseId) {
      throw new BadRequestException('Nije moguće odrediti skladište za razduženje');
    }
    return warehouseId;
  }

  private async resolveDisposalWarehouseId(
    user: AuthenticatedUser,
    equipment: {
      id: string;
      categoryId: string;
      status: string;
      warehouseId: string | null;
      stockLotId: string | null;
      currentHolderId: string | null;
      currentHolder: { id: string; orgUnitId: string } | null;
    },
  ): Promise<string | null> {
    const fullEquipment = await this.prisma.equipment.findUnique({
      where: { id: equipment.id },
      include: { currentHolder: true },
    });
    if (!fullEquipment) {
      return null;
    }
    return resolveDisposalTargetWarehouseId(
      {
        equipmentId: equipment.id,
        status: equipment.status,
        warehouseId: equipment.warehouseId,
        stockLotId: equipment.stockLotId ?? fullEquipment.stockLotId,
        currentHolderId: equipment.currentHolderId ?? fullEquipment.currentHolderId,
      },
      {
        loadStockLotWarehouseId: async (stockLotId) => {
          const lot = await this.prisma.warehouseStockLot.findUnique({
            where: { id: stockLotId },
            select: { warehouseId: true },
          });
          return lot?.warehouseId ?? null;
        },
        loadLastZaduzenjeFromWarehouseId: async (equipmentId) => {
          const transfer = await this.prisma.transfer.findFirst({
            where: {
              equipmentId,
              type: 'zaduzenje',
              fromWarehouseId: { not: null },
            },
            orderBy: { date: 'desc' },
            select: { fromWarehouseId: true },
          });
          return transfer?.fromWarehouseId ?? null;
        },
        resolveRegistrarWarehouseId: async () => {
          const matches = await this.registrarScope.getMatchingAssignmentsForEquipment(
            user,
            fullEquipment,
            fullEquipment.currentHolder,
          );
          return matches.find((row) => row.warehouseId)?.warehouseId ?? null;
        },
        resolveHolderWarehouseId: async (employeeId) =>
          this.warehouseResolutionService.resolveForEmployee(employeeId),
      },
    );
  }

  private async getDefaultSignerId(): Promise<string> {
    const employee = await this.prisma.employee.findFirst({ select: { id: true } });
    if (!employee) {
      throw new BadRequestException('No signer employee configured');
    }
    return employee.id;
  }
}
