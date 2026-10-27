import { isSystemAdmin } from '../auth/authorization-policy.util';
import { BadRequestException, Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../types/authenticated-user.type';
import { InventoryProductionModeService } from './inventory-production-mode.service';
import { WarehouseResolutionService } from './warehouse-resolution.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  findFreezeContextForEquipment,
  findFreezeContextForWarehouse,
  type InventoryFreezeContext,
} from '../utils/resolve-inventory-frozen-warehouses.util';

export type InventoryFreezeAction =
  | 'equipment_create'
  | 'equipment_update'
  | 'transfer_create'
  | 'transfer_finalize'
  | 'stock_lot_create'
  | 'stock_lot_issue';

@Injectable()
export class InventoryFreezeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly warehouseResolutionService: WarehouseResolutionService,
    private readonly productionModeService: InventoryProductionModeService,
  ) {}

  private canBypassInventoryFreeze(user: AuthenticatedUser): boolean {
    return isSystemAdmin(user) || user.role === 'moderator';
  }

  async assertNoEquipmentMutation(
    equipmentId: string,
    user: AuthenticatedUser,
    action: InventoryFreezeAction,
    options?: { inventoryLineId?: string | null; transferId?: string },
  ): Promise<void> {
    if (this.canBypassInventoryFreeze(user)) {
      return;
    }
    if (options?.inventoryLineId) {
      return;
    }
    if (options?.transferId) {
      const transfer = await this.prisma.transfer.findUnique({
        where: { id: options.transferId },
        select: { inventoryLineId: true },
      });
      if (transfer?.inventoryLineId) {
        return;
      }
    }
    const equipment = await this.prisma.equipment.findUnique({
      where: { id: equipmentId },
      select: {
        status: true,
        warehouseId: true,
        currentHolderId: true,
      },
    });
    if (!equipment) {
      return;
    }
    const freezeContext = await this.findFreezeContextForEquipment(equipment);
    if (!freezeContext) {
      return;
    }
    throw this.buildFreezeException(freezeContext, action);
  }

  async assertTransferCreateAllowed(
    equipmentId: string,
    user: AuthenticatedUser,
    type: string,
    inventoryLineId?: string | null,
  ): Promise<void> {
    if (inventoryLineId) {
      return;
    }
    await this.assertNoEquipmentMutation(equipmentId, user, 'transfer_create');
    if (type === 'rashodovanje') {
      await this.assertRashodovanjeOutsideInventoryBlocked(equipmentId, user);
    }
  }

  async assertTransferFinalizeAllowed(
    transferId: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    const transfer = await this.prisma.transfer.findUnique({
      where: { id: transferId },
      select: {
        equipmentId: true,
        inventoryLineId: true,
        inventoryLine: {
          select: { committee: { select: { session: { select: { status: true, name: true } } } } },
        },
      },
    });
    if (!transfer) {
      return;
    }
    if (transfer.inventoryLineId) {
      const sessionStatus = transfer.inventoryLine?.committee?.session?.status;
      if (sessionStatus === 'active') {
        throw new BadRequestException(
          'Inventory transfer cannot be finalized while inventory session is active',
        );
      }
      return;
    }
    await this.assertNoEquipmentMutation(transfer.equipmentId, user, 'transfer_finalize', {
      transferId,
    });
  }

  async assertRashodovanjeOutsideInventoryBlocked(
    equipmentId: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    if (this.canBypassInventoryFreeze(user)) {
      return;
    }
    const equipment = await this.prisma.equipment.findUnique({
      where: { id: equipmentId },
      select: { status: true, warehouseId: true, currentHolderId: true },
    });
    if (!equipment) {
      return;
    }
    const freezeContext = await this.findFreezeContextForEquipment(equipment);
    if (freezeContext) {
      throw new BadRequestException(
        'Rashodovanje preko prenosnice nije dozvoljeno tokom aktivnog popisa — koristite predloženi rashod u komisiji',
      );
    }
  }

  async assertNoMutationInWarehouse(
    warehouseId: string,
    user: AuthenticatedUser,
    action: InventoryFreezeAction,
  ): Promise<void> {
    if (this.canBypassInventoryFreeze(user)) {
      return;
    }
    const freezeContext = await findFreezeContextForWarehouse(warehouseId, {
      findActiveFreezeForWarehouse: (id) => this.findActiveFreezeForWarehouse(id),
      findProductionFreezeForWarehouse: (id) => this.findProductionFreezeForWarehouse(id),
    });
    if (!freezeContext) {
      return;
    }
    throw this.buildFreezeException(freezeContext, action);
  }

  async findFrozenContextForEquipment(equipmentId: string): Promise<InventoryFreezeContext | null> {
    const equipment = await this.prisma.equipment.findUnique({
      where: { id: equipmentId },
      select: { status: true, warehouseId: true, currentHolderId: true },
    });
    if (!equipment) {
      return null;
    }
    return this.findFreezeContextForEquipment(equipment);
  }

  private async findFreezeContextForEquipment(equipment: {
    status: string;
    warehouseId: string | null;
    currentHolderId: string | null;
  }): Promise<InventoryFreezeContext | null> {
    return findFreezeContextForEquipment(equipment, {
      resolveEquipmentWarehouseId: (input) => this.resolveEquipmentWarehouseId(input),
      findActiveFreezeForWarehouse: (warehouseId) => this.findActiveFreezeForWarehouse(warehouseId),
      findProductionFreezeForWarehouse: (warehouseId) =>
        this.findProductionFreezeForWarehouse(warehouseId),
    });
  }

  private async resolveEquipmentWarehouseId(input: {
    status: string;
    warehouseId: string | null;
    currentHolderId: string | null;
  }): Promise<string | null> {
    if (input.status === 'skladiste' && input.warehouseId) {
      return input.warehouseId;
    }
    if (input.currentHolderId) {
      return this.warehouseResolutionService.resolveForEmployee(input.currentHolderId);
    }
    return input.warehouseId;
  }

  private async findActiveFreezeForWarehouse(
    warehouseId: string,
  ): Promise<InventoryFreezeContext | null> {
    const committee = await this.prisma.inventoryCommittee.findFirst({
      where: {
        warehouseId,
        session: { status: 'active' },
      },
      select: {
        session: { select: { id: true, name: true } },
        warehouse: { select: { id: true, name: true } },
      },
      orderBy: { session: { createdAt: 'desc' } },
    });
    if (!committee?.warehouse || !committee.session) {
      return null;
    }
    return {
      sessionId: committee.session.id,
      sessionName: committee.session.name,
      warehouseId: committee.warehouse.id,
      warehouseName: committee.warehouse.name,
      reason: 'active_session',
    };
  }

  private async findProductionFreezeForWarehouse(
    warehouseId: string,
  ): Promise<InventoryFreezeContext | null> {
    if (!(await this.productionModeService.isProductionModeEnabled())) {
      return null;
    }
    const committees = await this.prisma.inventoryCommittee.findMany({
      where: {
        warehouseId,
        session: { status: { in: ['draft', 'active', 'closing'] } },
      },
      select: {
        session: {
          select: {
            id: true,
            name: true,
            orgUnitId: true,
            orgUnit: { select: { name: true } },
          },
        },
        warehouse: { select: { id: true, name: true } },
      },
      orderBy: { session: { year: 'desc' } },
    });
    for (const committee of committees) {
      if (!committee.session || !committee.warehouse) {
        continue;
      }
      if (await this.productionModeService.isProductionLockActive(committee.session.orgUnitId)) {
        return {
          sessionId: committee.session.id,
          sessionName: committee.session.name,
          warehouseId: committee.warehouse.id,
          warehouseName: committee.warehouse.name,
          reason: 'production_lock',
        };
      }
    }
    return null;
  }

  private buildFreezeException(
    freezeContext: InventoryFreezeContext,
    action: InventoryFreezeAction,
  ): BadRequestException {
    if (freezeContext.reason === 'production_lock') {
      return new BadRequestException(
        `Produkcijski režim popisa je aktivan za skladište "${freezeContext.warehouseName}" — akcija "${action}" nije dozvoljena`,
      );
    }
    return new BadRequestException(
      `Godišnji popis "${freezeContext.sessionName}" je aktivan za skladište "${freezeContext.warehouseName}" — akcija "${action}" nije dozvoljena`,
    );
  }
}
