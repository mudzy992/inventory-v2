import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  InstalledPartEventAction,
  InstalledPartStatus,
  Prisma,
} from '../../../generated/prisma/client';
import { InventoryFreezeService } from '../../common/services/inventory-freeze.service';
import { ModeratorScopeService } from '../../common/services/moderator-scope.service';
import { RegistrarScopeService } from '../../common/services/registrar-scope.service';
import { assertCanReadEquipment } from '../equipment/equipment-access.util';
import { validateLotSpecifications } from '../../common/utils/category-fields.util';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { PrismaService } from '../../prisma/prisma.service';
import { CategoriesService } from '../categories/categories.service';
import { SettingsService } from '../settings/settings.service';
import { WarehousesService } from '../warehouses/warehouses.service';
import type { InstallMaintenancePartDto } from './dto/install-part.dto';
import type { ReceiveMaintenanceLotDto } from './dto/receive-maintenance-lot.dto';
import type { ReplaceMaintenancePartDto } from './dto/replace-part.dto';
import {
  aggregateMaintenanceConsumption,
  type MaintenanceConsumptionRow,
} from './utils/aggregate-consumption.util';
import { isMaintenanceLeafAllowedForHost } from './utils/expand-maintenance-catalog.util';

const partInclude = {
  maintenanceCategory: true,
  stockLot: { include: { warehouse: true } },
  installedBy: { select: { id: true, username: true } },
  replaces: { select: { id: true, status: true, installedAt: true } },
} satisfies Prisma.EquipmentInstalledPartInclude;

@Injectable()
export class MaintenancePartsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    private readonly categoriesService: CategoriesService,
    private readonly registrarScope: RegistrarScopeService,
    private readonly inventoryFreeze: InventoryFreezeService,
    private readonly warehousesService: WarehousesService,
    private readonly moderatorScope: ModeratorScopeService,
  ) {}

  private async assertEnabled(): Promise<void> {
    await this.settingsService.assertFeatureEnabled('features.maintenance_parts');
  }

  async getCategoryLinks(hostCategoryId: string) {
    await this.assertEnabled();
    await this.categoriesService.findOne(hostCategoryId);
    const links = await this.prisma.categoryMaintenanceLink.findMany({
      where: { hostCategoryId },
      include: { maintenanceCategory: true },
      orderBy: { maintenanceCategory: { name: 'asc' } },
    });
    return links.map((row) => ({
      id: row.id,
      hostCategoryId: row.hostCategoryId,
      maintenanceCategory: row.maintenanceCategory,
    }));
  }

  async setCategoryLinks(hostCategoryId: string, maintenanceCategoryIds: string[]) {
    await this.assertEnabled();
    await this.settingsService.assertFeatureEnabled('features.categories');
    const host = await this.categoriesService.findOne(hostCategoryId);
    if (host.categoryKind !== 'ASSET') {
      throw new BadRequestException('Host category must be an asset category');
    }
    await this.categoriesService.assertLeafCategory(hostCategoryId);
    const uniqueIds = [...new Set(maintenanceCategoryIds)];
    for (const maintenanceCategoryId of uniqueIds) {
      const maintenance = await this.categoriesService.findOne(maintenanceCategoryId);
      if (maintenance.categoryKind !== 'MAINTENANCE') {
        throw new BadRequestException(`Category ${maintenance.name} must be maintenance type`);
      }
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.categoryMaintenanceLink.deleteMany({ where: { hostCategoryId } });
      if (uniqueIds.length === 0) {
        return [];
      }
      await tx.categoryMaintenanceLink.createMany({
        data: uniqueIds.map((maintenanceCategoryId) => ({
          hostCategoryId,
          maintenanceCategoryId,
        })),
      });
      return tx.categoryMaintenanceLink.findMany({
        where: { hostCategoryId },
        include: { maintenanceCategory: true },
        orderBy: { maintenanceCategory: { name: 'asc' } },
      });
    });
  }

  async getWarehouseConsumptionSummary(
    user: AuthenticatedUser,
    warehouseId: string,
    hostCategoryId?: string,
  ): Promise<MaintenanceConsumptionRow[]> {
    await this.assertEnabled();
    await this.assertWarehouseReadAccess(user, warehouseId);
    const parts = await this.prisma.equipmentInstalledPart.findMany({
      where: { stockLot: { warehouseId, lotKind: 'MAINTENANCE' } },
      include: {
        maintenanceCategory: { select: { id: true, name: true } },
        hostEquipment: { include: { category: { select: { id: true, name: true } } } },
      },
    });
    const rows: {
      maintenanceCategoryId: string;
      maintenanceCategoryName: string;
      hostCategoryId: string;
      hostCategoryName: string;
      quantity: number;
      status: InstalledPartStatus;
    }[] = [];
    for (const part of parts) {
      rows.push({
        maintenanceCategoryId: part.maintenanceCategory.id,
        maintenanceCategoryName: part.maintenanceCategory.name,
        hostCategoryId: part.hostEquipment.categoryId,
        hostCategoryName: part.hostEquipment.category.name,
        quantity: part.quantity,
        status: part.status,
      });
    }
    return aggregateMaintenanceConsumption(rows, hostCategoryId);
  }

  async listMaintenanceLots(user: AuthenticatedUser, warehouseId: string) {
    await this.assertEnabled();
    await this.assertWarehouseReadAccess(user, warehouseId);
    const lots = await this.prisma.warehouseStockLot.findMany({
      where: { warehouseId, lotKind: 'MAINTENANCE' },
      include: { category: true },
      orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
    });
    if (user.role === 'admin') {
      return lots;
    }
    if (user.role === 'skladistar') {
      return lots;
    }
    const filtered = [];
    for (const lot of lots) {
      if (await this.registrarScope.canAccessStockLot(user, lot)) {
        filtered.push(lot);
      }
    }
    return filtered;
  }

  async receiveMaintenanceLot(
    user: AuthenticatedUser,
    warehouseId: string,
    dto: ReceiveMaintenanceLotDto,
  ) {
    await this.assertEnabled();
    if (user.role !== 'skladistar' && user.role !== 'admin' && user.role !== 'evidenticar' && !this.moderatorScope.isModerator(user)) {
      throw new ForbiddenException('Not allowed to receive maintenance stock');
    }
    if (user.role === 'skladistar') {
      await this.warehousesService.assertKeeperCanManageWarehouse(user, warehouseId);
    }
    if (this.moderatorScope.isModerator(user)) {
      await this.moderatorScope.assertWarehouseAssigned(user, warehouseId);
    }
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: warehouseId },
      select: { cityId: true, isActive: true },
    });
    if (!warehouse?.isActive) {
      throw new BadRequestException('Warehouse not found or inactive');
    }
    await this.inventoryFreeze.assertNoMutationInWarehouse(warehouseId, user, 'stock_lot_create');
    const category = await this.categoriesService.assertLeafCategory(dto.categoryId);
    if (category.categoryKind !== 'MAINTENANCE') {
      throw new BadRequestException('Category must be maintenance type');
    }
    const specsInput = dto.legacySpecs ?? {};
    const specs: Record<string, string> = Object.fromEntries(
      Object.entries(specsInput).map(([key, value]) => [key, String(value)]),
    );
    const { optionalFields } = this.categoriesService.getFieldDefinitions(category);
    const status: 'ceka_specifikaciju' | 'spremno_za_izdavanje' =
      optionalFields.length === 0
        ? 'spremno_za_izdavanje'
        : (() => {
            try {
              validateLotSpecifications(specs, optionalFields);
              return 'spremno_za_izdavanje' as const;
            } catch {
              return 'ceka_specifikaciju' as const;
            }
          })();
    return this.prisma.warehouseStockLot.create({
      data: {
        warehouseId,
        categoryId: dto.categoryId,
        lotKind: 'MAINTENANCE',
        productName: dto.productName.trim(),
        quantityReceived: dto.quantity,
        quantityOnHand: dto.quantity,
        status,
        specifications: specs,
        contractNumber: dto.contractNumber?.trim() || null,
        entryDate: new Date(dto.entryDate),
        notes: dto.notes?.trim() || null,
        receivedByUserId: user.id,
        specDefinedByUserId: status === 'spremno_za_izdavanje' ? user.id : null,
        specDefinedAt: status === 'spremno_za_izdavanje' ? new Date() : null,
      },
      include: { category: true, warehouse: true },
    });
  }

  async listInstalledParts(user: AuthenticatedUser, equipmentId: string) {
    await this.assertEnabled();
    const equipment = await this.getHostEquipmentForRead(equipmentId);
    const holder = equipment.currentHolderId
      ? await this.prisma.employee.findUnique({ where: { id: equipment.currentHolderId } })
      : null;
    await assertCanReadEquipment(user, equipment, holder, this.registrarScope, this.prisma);
    return this.prisma.equipmentInstalledPart.findMany({
      where: { hostEquipmentId: equipmentId },
      include: partInclude,
      orderBy: [{ status: 'asc' }, { installedAt: 'desc' }],
    });
  }

  async listAvailableLotsForHost(
    user: AuthenticatedUser,
    equipmentId: string,
    maintenanceCategoryId: string,
  ) {
    await this.assertEnabled();
    const equipment = await this.getHostEquipmentForWrite(equipmentId);
    const holder = equipment.currentHolderId
      ? await this.prisma.employee.findUnique({ where: { id: equipment.currentHolderId } })
      : null;
    await this.registrarScope.assertCanAccessEquipment(user, equipment, holder);
    await this.assertMaintenanceAllowedForHost(equipment, maintenanceCategoryId);
    const lots = await this.prisma.warehouseStockLot.findMany({
      where: {
        lotKind: 'MAINTENANCE',
        categoryId: maintenanceCategoryId,
        quantityOnHand: { gt: 0 },
        status: 'spremno_za_izdavanje',
      },
      include: { warehouse: true, category: true },
      orderBy: [{ productName: 'asc' }, { entryDate: 'desc' }],
    });
    const filtered = [];
    for (const lot of lots) {
      if (user.role === 'admin' || (await this.registrarScope.canAccessStockLot(user, lot))) {
        filtered.push(lot);
      }
    }
    return filtered;
  }

  async installPart(user: AuthenticatedUser, equipmentId: string, dto: InstallMaintenancePartDto) {
    await this.assertEnabled();
    if (user.role !== 'evidenticar' && user.role !== 'admin') {
      throw new ForbiddenException('Only registrar can install maintenance parts');
    }
    const equipment = await this.getHostEquipmentForWrite(equipmentId);
    const holder = equipment.currentHolderId
      ? await this.prisma.employee.findUnique({ where: { id: equipment.currentHolderId } })
      : null;
    await this.registrarScope.assertCanAccessEquipment(user, equipment, holder);
    const lot = await this.getMaintenanceLotOrThrow(dto.stockLotId);
    await this.registrarScope.assertCanAccessStockLot(user, lot);
    await this.assertMaintenanceAllowedForHost(equipment, lot.categoryId);
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: lot.warehouseId },
      select: { id: true, cityId: true },
    });
    if (warehouse) {
      await this.inventoryFreeze.assertNoMutationInWarehouse(warehouse.id, user, 'stock_lot_issue');
    }
    if (lot.quantityOnHand < dto.quantity) {
      throw new BadRequestException('Insufficient quantity on stock lot');
    }
    const legacySpecs = dto.legacySpecs ?? lot.specifications;
    return this.prisma.$transaction(async (tx) => {
      const updatedLot = await tx.warehouseStockLot.update({
        where: { id: lot.id },
        data: {
          quantityOnHand: { decrement: dto.quantity },
          status: lot.quantityOnHand - dto.quantity <= 0 ? 'zatvoreno' : lot.status,
        },
      });
      const part = await tx.equipmentInstalledPart.create({
        data: {
          hostEquipmentId: equipmentId,
          stockLotId: lot.id,
          maintenanceCategoryId: lot.categoryId,
          quantity: dto.quantity,
          legacySpecs: legacySpecs as Prisma.InputJsonValue,
          status: 'active',
          notes: dto.notes?.trim() || null,
          installedByUserId: user.id,
        },
        include: partInclude,
      });
      await this.recordPartEvent(tx, part.id, user.id, 'installed', {
        stockLotId: lot.id,
        quantity: dto.quantity,
      });
      return { part, lot: updatedLot };
    });
  }

  async markPartFaulty(user: AuthenticatedUser, partId: string, note?: string) {
    await this.assertEnabled();
    const part = await this.getPartOrThrow(partId);
    await this.assertCanManagePart(user, part);
    if (part.status !== 'active') {
      throw new BadRequestException('Only active parts can be marked faulty');
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.equipmentInstalledPart.update({
        where: { id: partId },
        data: { status: 'faulty', notes: note?.trim() || part.notes },
        include: partInclude,
      });
      await this.recordPartEvent(tx, partId, user.id, 'marked_faulty', { note: note ?? null });
      return updated;
    });
  }

  async removePart(user: AuthenticatedUser, partId: string, note?: string) {
    await this.assertEnabled();
    const part = await this.getPartOrThrow(partId);
    await this.assertCanManagePart(user, part);
    if (part.status === 'removed') {
      throw new BadRequestException('Part already removed');
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.equipmentInstalledPart.update({
        where: { id: partId },
        data: {
          status: 'removed',
          removedAt: new Date(),
          notes: note?.trim() || part.notes,
        },
        include: partInclude,
      });
      await this.recordPartEvent(tx, partId, user.id, 'removed', { note: note ?? null });
      return updated;
    });
  }

  async replacePart(user: AuthenticatedUser, partId: string, dto: ReplaceMaintenancePartDto) {
    await this.assertEnabled();
    if (user.role !== 'evidenticar' && user.role !== 'admin') {
      throw new ForbiddenException('Only registrar can replace maintenance parts');
    }
    const oldPart = await this.getPartOrThrow(partId);
    await this.assertCanManagePart(user, oldPart);
    if (oldPart.status === 'removed') {
      throw new BadRequestException('Cannot replace a removed part');
    }
    const lot = await this.getMaintenanceLotOrThrow(dto.stockLotId);
    await this.registrarScope.assertCanAccessStockLot(user, lot);
    if (lot.categoryId !== oldPart.maintenanceCategoryId) {
      throw new BadRequestException('Replacement lot must match maintenance category');
    }
    const equipment = await this.getHostEquipmentForWrite(oldPart.hostEquipmentId);
    await this.assertMaintenanceAllowedForHost(equipment, lot.categoryId);
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: lot.warehouseId },
      select: { id: true, cityId: true },
    });
    if (warehouse) {
      await this.inventoryFreeze.assertNoMutationInWarehouse(warehouse.id, user, 'stock_lot_issue');
    }
    if (lot.quantityOnHand < dto.quantity) {
      throw new BadRequestException('Insufficient quantity on stock lot');
    }
    const legacySpecs = dto.legacySpecs ?? lot.specifications;
    return this.prisma.$transaction(async (tx) => {
      await tx.warehouseStockLot.update({
        where: { id: lot.id },
        data: {
          quantityOnHand: { decrement: dto.quantity },
          status: lot.quantityOnHand - dto.quantity <= 0 ? 'zatvoreno' : lot.status,
        },
      });
      await tx.equipmentInstalledPart.update({
        where: { id: partId },
        data: {
          status: 'removed',
          removedAt: new Date(),
        },
      });
      const newPart = await tx.equipmentInstalledPart.create({
        data: {
          hostEquipmentId: oldPart.hostEquipmentId,
          stockLotId: lot.id,
          maintenanceCategoryId: lot.categoryId,
          quantity: dto.quantity,
          legacySpecs: legacySpecs as Prisma.InputJsonValue,
          status: 'active',
          notes: dto.notes?.trim() || null,
          installedByUserId: user.id,
          replacedById: partId,
        },
        include: partInclude,
      });
      await this.recordPartEvent(tx, partId, user.id, 'replaced', { newPartId: newPart.id });
      await this.recordPartEvent(tx, newPart.id, user.id, 'installed', {
        stockLotId: lot.id,
        quantity: dto.quantity,
        replacedPartId: partId,
      });
      return newPart;
    });
  }

  async listLinkedHostCategories() {
    await this.assertEnabled();
    const links = await this.prisma.categoryMaintenanceLink.findMany({
      select: { hostCategoryId: true },
      distinct: ['hostCategoryId'],
    });
    const hostIds = links.map((row) => row.hostCategoryId);
    if (hostIds.length === 0) {
      return [];
    }
    return this.prisma.category.findMany({
      where: { id: { in: hostIds }, categoryKind: 'ASSET' },
      select: { id: true, name: true, parentId: true },
      orderBy: { name: 'asc' },
    });
  }

  private async assertMaintenanceAllowedForHost(
    equipment: { id: string; categoryId: string },
    maintenanceCategoryId: string,
  ): Promise<void> {
    const allowed = await isMaintenanceLeafAllowedForHost(
      this.prisma,
      equipment.categoryId,
      maintenanceCategoryId,
    );
    if (!allowed) {
      throw new BadRequestException(
        'Maintenance category is not linked to this equipment category',
      );
    }
  }

  private async assertCanManagePart(
    user: AuthenticatedUser,
    part: { hostEquipmentId: string },
  ): Promise<void> {
    const equipment = await this.getHostEquipmentForWrite(part.hostEquipmentId);
    const holder = equipment.currentHolderId
      ? await this.prisma.employee.findUnique({ where: { id: equipment.currentHolderId } })
      : null;
    await this.registrarScope.assertCanAccessEquipment(user, equipment, holder);
  }

  private async assertWarehouseReadAccess(user: AuthenticatedUser, warehouseId: string): Promise<void> {
    if (user.role === 'admin') {
      return;
    }
    if (user.role === 'skladistar') {
      await this.warehousesService.assertKeeperCanManageWarehouse(user, warehouseId);
      return;
    }
    if (user.role === 'evidenticar') {
      const hasScope = user.registrarScopes?.some((row) => row.warehouseId === warehouseId);
      if (!hasScope) {
        throw new ForbiddenException('Warehouse outside your scope');
      }
      return;
    }
    if (this.moderatorScope.isModerator(user)) {
      await this.moderatorScope.assertWarehouseAssigned(user, warehouseId);
      return;
    }
    throw new ForbiddenException('Not allowed');
  }

  private async findHostEquipmentOrThrow(equipmentId: string) {
    const equipment = await this.prisma.equipment.findUnique({
      where: { id: equipmentId },
      include: { category: true, currentHolder: true },
    });
    if (!equipment) {
      throw new NotFoundException('Equipment not found');
    }
    if (equipment.category.categoryKind !== 'ASSET') {
      throw new BadRequestException('Host must be asset equipment');
    }
    return equipment;
  }

  private async getHostEquipmentForRead(equipmentId: string) {
    const equipment = await this.findHostEquipmentOrThrow(equipmentId);
    if (equipment.status === 'rashodovano') {
      throw new BadRequestException('Cannot manage parts on decommissioned equipment');
    }
    return equipment;
  }

  private async getHostEquipmentForWrite(equipmentId: string) {
    const equipment = await this.getHostEquipmentForRead(equipmentId);
    if (equipment.status === 'za_rashod') {
      throw new BadRequestException('Cannot manage parts on equipment marked for disposal');
    }
    return equipment;
  }

  private async getMaintenanceLotOrThrow(lotId: string) {
    const lot = await this.prisma.warehouseStockLot.findUnique({ where: { id: lotId } });
    if (!lot || lot.lotKind !== 'MAINTENANCE') {
      throw new NotFoundException('Maintenance stock lot not found');
    }
    if (lot.status !== 'spremno_za_izdavanje') {
      throw new BadRequestException('Maintenance lot is not ready for use');
    }
    return lot;
  }

  private async getPartOrThrow(partId: string) {
    const part = await this.prisma.equipmentInstalledPart.findUnique({
      where: { id: partId },
      include: { hostEquipment: { include: { category: true } } },
    });
    if (!part) {
      throw new NotFoundException('Installed part not found');
    }
    return part;
  }

  private async recordPartEvent(
    tx: Prisma.TransactionClient,
    installedPartId: string,
    actorUserId: string,
    action: InstalledPartEventAction,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await tx.equipmentInstalledPartEvent.create({
      data: {
        installedPartId,
        actorUserId,
        action,
        payload: payload as Prisma.InputJsonValue,
      },
    });
  }
}
