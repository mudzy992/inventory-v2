import { BadRequestException, Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../types/authenticated-user.type';
import { LocationResolutionService } from './location-resolution.service';
import { PrismaService } from '../../prisma/prisma.service';

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
    private readonly locationResolutionService: LocationResolutionService,
  ) {}

  async assertNoEquipmentMutation(
    equipmentId: string,
    user: AuthenticatedUser,
    action: InventoryFreezeAction,
    options?: { inventoryLineId?: string | null; transferId?: string },
  ): Promise<void> {
    if (user.role === 'admin') {
      return;
    }
    if (options?.inventoryLineId) {
      return;
    }
    const activeSession = await this.findActiveSessionForEquipment(equipmentId);
    if (!activeSession) {
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
    throw new BadRequestException(
      `Godišnji popis "${activeSession.name}" je aktivan u ovom gradu — akcija "${action}" nije dozvoljena`,
    );
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
    if (user.role === 'admin') {
      return;
    }
    const activeSession = await this.findActiveSessionForEquipment(equipmentId);
    if (activeSession) {
      throw new BadRequestException(
        'Rashodovanje preko prenosnice nije dozvoljeno tokom aktivnog popisa — koristite predloženi rashod u komisiji',
      );
    }
  }

  async assertNoMutationInCity(
    cityId: string,
    user: AuthenticatedUser,
    action: InventoryFreezeAction,
  ): Promise<void> {
    if (user.role === 'admin') {
      return;
    }
    const session = await this.prisma.inventorySession.findFirst({
      where: { status: 'active', orgUnit: { effectiveLocationCityId: cityId } },
      select: { name: true },
    });
    if (session) {
      throw new BadRequestException(
        `Godišnji popis "${session.name}" je aktivan u ovom gradu — akcija "${action}" nije dozvoljena`,
      );
    }
  }

  async findActiveSessionForEquipment(equipmentId: string): Promise<{ id: string; name: string } | null> {
    const equipment = await this.prisma.equipment.findUnique({
      where: { id: equipmentId },
      include: { currentHolder: true, warehouse: true },
    });
    if (!equipment) {
      return null;
    }
    const cityId = await this.resolveEquipmentCityId(equipment);
    if (!cityId) {
      return null;
    }
    const session = await this.prisma.inventorySession.findFirst({
      where: { status: 'active', orgUnit: { effectiveLocationCityId: cityId } },
      select: { id: true, name: true },
    });
    return session;
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
