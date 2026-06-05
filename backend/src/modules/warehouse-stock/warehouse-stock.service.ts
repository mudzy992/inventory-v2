import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, WarehouseStockLot } from '../../../generated/prisma/client';
import { InventoryFreezeService } from '../../common/services/inventory-freeze.service';
import { RegistrarScopeService } from '../../common/services/registrar-scope.service';
import { SignerResolutionService } from '../../common/services/signer-resolution.service';
import {
  validateIssueSpecifications,
  validateLotSpecifications,
} from '../../common/utils/category-fields.util';
import { loadKeeperWarehouseIds } from '../../common/utils/warehouse-keeper-access.util';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { PrismaService } from '../../prisma/prisma.service';
import { CategoriesService } from '../categories/categories.service';
import { EquipmentCatalogService } from '../equipment-catalog/equipment-catalog.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';
import { WarehousesService } from '../warehouses/warehouses.service';
import { BulkCreateStockLotDto } from './dto/bulk-create-stock-lot.dto';
import { CreateStockLotDto } from './dto/create-stock-lot.dto';
import { IssueStockLotDto } from './dto/issue-stock-lot.dto';
import { UpdateStockLotSpecDto } from './dto/update-stock-lot-spec.dto';
import { TransferDocumentGenerationService } from '../transfers/transfer-document-generation.service';
import { assertTransferCreationAllowed } from '../transfers/utils/transfer-generation-policy.util';
import { executeStockLotIssueInTx } from './utils/finalize-stock-lot-issue.util';
import { resolveTransferSignerId } from '../transfers/utils/resolve-transfer-signer.util';

const lotInclude = {
  category: true,
  warehouse: { include: { city: true } },
  receivedBy: { select: { id: true, username: true } },
  specDefinedBy: { select: { id: true, username: true } },
  issuedUnits: {
    select: {
      id: true,
      inventoryNumber: true,
      status: true,
      currentHolderId: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' as const },
  },
} satisfies Prisma.WarehouseStockLotInclude;

@Injectable()
export class WarehouseStockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categoriesService: CategoriesService,
    private readonly catalogService: EquipmentCatalogService,
    private readonly registrarScope: RegistrarScopeService,
    private readonly inventoryFreeze: InventoryFreezeService,
    private readonly warehousesService: WarehousesService,
    private readonly notificationsService: NotificationsService,
    private readonly signerResolutionService: SignerResolutionService,
    private readonly settingsService: SettingsService,
    private readonly transferDocumentGeneration: TransferDocumentGenerationService,
  ) {}

  async listForWarehouse(user: AuthenticatedUser, warehouseId: string) {
    await this.assertCanAccessWarehouse(user, warehouseId);
    const lots = await this.prisma.warehouseStockLot.findMany({
      where: { warehouseId, lotKind: 'ISSUABLE' },
      include: { category: true },
      orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
    });
    return lots.map((lot) => this.mapLotForUser(user, lot));
  }

  async listForRegistrar(user: AuthenticatedUser) {
    if (user.role !== 'evidenticar' && user.role !== 'admin') {
      throw new ForbiddenException('Only registrar or admin can list assigned stock');
    }
    const assignments = user.role === 'admin' ? null : user.registrarScopes;
    const lots = await this.prisma.warehouseStockLot.findMany({
      where: {
        lotKind: 'ISSUABLE',
        status: { in: ['ceka_specifikaciju', 'spremno_za_izdavanje'] },
        quantityOnHand: { gt: 0 },
      },
      include: { category: true, warehouse: true },
      orderBy: [{ status: 'asc' }, { entryDate: 'desc' }],
    });
    const filtered = [];
    for (const lot of lots) {
      if (user.role === 'admin' || (await this.registrarScope.canAccessStockLot(user, lot, assignments ?? undefined))) {
        filtered.push(this.mapLotForUser(user, lot, true));
      }
    }
    return filtered;
  }

  async findOne(user: AuthenticatedUser, lotId: string) {
    const lot = await this.getLotOrThrow(lotId);
    await this.assertCanAccessLot(user, lot);
    const full = await this.prisma.warehouseStockLot.findUnique({
      where: { id: lotId },
      include: lotInclude,
    });
    if (!full) {
      throw new NotFoundException('Stock lot not found');
    }
    return this.mapLotDetail(user, full);
  }

  async receive(user: AuthenticatedUser, warehouseId: string, dto: CreateStockLotDto) {
    await this.settingsService.assertFeatureEnabled('features.registrar_stock');
    if (user.role !== 'skladistar' && user.role !== 'admin') {
      throw new ForbiddenException('Only warehouse keeper can receive stock');
    }
    if (user.role === 'skladistar') {
      await this.warehousesService.assertKeeperCanManageWarehouse(user, warehouseId);
    }
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: warehouseId },
      select: { cityId: true, isActive: true },
    });
    if (!warehouse?.isActive) {
      throw new BadRequestException('Warehouse not found or inactive');
    }
    await this.inventoryFreeze.assertNoMutationInCity(warehouse.cityId, user, 'stock_lot_create');
    const category = await this.categoriesService.assertLeafCategory(dto.categoryId);
    if (category.categoryKind === 'MAINTENANCE') {
      throw new BadRequestException('Use maintenance stock endpoint for maintenance categories');
    }
    const resolved = await this.catalogService.resolveForStockLot({
      catalogItemId: dto.catalogItemId,
      productName: dto.productName ?? '',
      categoryId: dto.categoryId,
    });
    if (!resolved.productName) {
      throw new BadRequestException('Naziv robe ili stavka šifrarnika je obavezan');
    }
    const lot = await this.prisma.warehouseStockLot.create({
      data: {
        warehouseId,
        categoryId: dto.categoryId,
        catalogItemId: resolved.catalogItemId,
        lotKind: 'ISSUABLE',
        productName: resolved.productName,
        quantityReceived: dto.quantity,
        quantityOnHand: dto.quantity,
        status: 'ceka_specifikaciju',
        specifications: {},
        contractNumber: dto.contractNumber?.trim() || null,
        entryDate: new Date(dto.entryDate),
        notes: dto.notes?.trim() || null,
        receivedByUserId: user.id,
      },
      include: { category: true, warehouse: true },
    });
    await this.notificationsService.notifyWarehouseStockReceived(lot.id);
    return this.mapLotForUser(user, lot, true);
  }

  async receiveBulk(user: AuthenticatedUser, warehouseId: string, dto: BulkCreateStockLotDto) {
    await this.settingsService.assertFeatureEnabled('features.registrar_stock');
    if (user.role !== 'skladistar' && user.role !== 'admin') {
      throw new ForbiddenException('Only warehouse keeper can receive stock');
    }
    if (user.role === 'skladistar') {
      await this.warehousesService.assertKeeperCanManageWarehouse(user, warehouseId);
    }
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: warehouseId },
      select: { cityId: true, isActive: true },
    });
    if (!warehouse?.isActive) {
      throw new BadRequestException('Warehouse not found or inactive');
    }
    await this.inventoryFreeze.assertNoMutationInCity(warehouse.cityId, user, 'stock_lot_create');
    const createdLots = await this.prisma.$transaction(async (tx) => {
      const lots = [];
      for (const item of dto.items) {
        const category = await this.categoriesService.assertLeafCategory(item.categoryId);
        if (category.categoryKind === 'MAINTENANCE') {
          throw new BadRequestException('Use maintenance stock endpoint for maintenance categories');
        }
        const resolved = await this.catalogService.resolveForStockLot({
          catalogItemId: item.catalogItemId,
          productName: '',
          categoryId: item.categoryId,
        });
        const lot = await tx.warehouseStockLot.create({
          data: {
            warehouseId,
            categoryId: item.categoryId,
            catalogItemId: resolved.catalogItemId,
            lotKind: 'ISSUABLE',
            productName: resolved.productName,
            quantityReceived: item.quantity,
            quantityOnHand: item.quantity,
            status: 'ceka_specifikaciju',
            specifications: {},
            contractNumber: item.contractNumber?.trim() || null,
            entryDate: new Date(item.entryDate),
            receivedByUserId: user.id,
          },
          include: { category: true, warehouse: true },
        });
        lots.push(lot);
      }
      return lots;
    });
    for (const lot of createdLots) {
      await this.notificationsService.notifyWarehouseStockReceived(lot.id);
    }
    return createdLots.map((lot) => this.mapLotForUser(user, lot, true));
  }

  async defineSpecifications(
    user: AuthenticatedUser,
    lotId: string,
    dto: UpdateStockLotSpecDto,
  ) {
    if (user.role !== 'evidenticar' && user.role !== 'admin') {
      throw new ForbiddenException('Only registrar can define stock specifications');
    }
    const lot = await this.getLotOrThrow(lotId);
    await this.registrarScope.assertCanAccessStockLot(user, lot);
    if (lot.status === 'zatvoreno') {
      throw new BadRequestException('Stock lot is closed');
    }
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: lot.warehouseId },
      select: { cityId: true },
    });
    if (warehouse) {
      await this.inventoryFreeze.assertNoMutationInCity(warehouse.cityId, user, 'stock_lot_issue');
    }
    const category = await this.categoriesService.assertLeafCategory(lot.categoryId);
    const { fields, optionalFields } = this.categoriesService.getFieldDefinitions(category);
    validateLotSpecifications(dto.specifications, fields, optionalFields);
    const updated = await this.prisma.warehouseStockLot.update({
      where: { id: lotId },
      data: {
        specifications: dto.specifications,
        status: 'spremno_za_izdavanje',
        specDefinedByUserId: user.id,
        specDefinedAt: new Date(),
      },
      include: lotInclude,
    });
    return this.mapLotDetail(user, updated);
  }

  async issueUnit(user: AuthenticatedUser, lotId: string, dto: IssueStockLotDto) {
    await this.settingsService.assertFeatureEnabled('features.registrar_stock');
    if (user.role !== 'evidenticar' && user.role !== 'admin') {
      throw new ForbiddenException('Only registrar can issue stock');
    }
    const lot = await this.getLotOrThrow(lotId);
    if (lot.lotKind === 'MAINTENANCE') {
      throw new BadRequestException('Maintenance stock lots cannot issue equipment units');
    }
    await this.registrarScope.assertCanAccessStockLot(user, lot);
    if (lot.status !== 'spremno_za_izdavanje') {
      throw new BadRequestException('Define lot specifications before issuing units');
    }
    if (lot.quantityOnHand <= 0) {
      throw new BadRequestException('No units remaining on this lot');
    }
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: lot.warehouseId },
      select: { cityId: true },
    });
    if (warehouse) {
      await this.inventoryFreeze.assertNoMutationInCity(warehouse.cityId, user, 'stock_lot_issue');
    }
    const category = await this.categoriesService.assertLeafCategory(lot.categoryId);
    const { fields, optionalFields } = this.categoriesService.getFieldDefinitions(category);
    validateIssueSpecifications(dto.uniqueSpecifications, fields, optionalFields);
    const holder = await this.prisma.employee.findUnique({ where: { id: dto.employeeId } });
    if (!holder) {
      throw new NotFoundException('Employee not found');
    }
    const canHolder = await this.registrarScope.canAccessEmployee(user, holder);
    if (!canHolder) {
      throw new ForbiddenException('Employee outside your scope');
    }
    const lotSpecs = (lot.specifications ?? {}) as Record<string, string>;
    const mergedSpecifications = { ...lotSpecs, ...dto.uniqueSpecifications };
    const signerResolved = dto.signerId
      ? dto.signerId
      : await resolveTransferSignerId(this.signerResolutionService, {
          type: 'zaduzenje',
          toPersonId: dto.employeeId,
        });
    const signerId = this.signerResolutionService.assertEffectiveSignerConfigured(signerResolved);
    const transferDate = dto.date ? new Date(dto.date) : new Date();
    await assertTransferCreationAllowed(this.settingsService, 'zaduzenje', 'stock_lot');
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const issued = await executeStockLotIssueInTx(tx, {
          lot: {
            id: lot.id,
            warehouseId: lot.warehouseId,
            categoryId: lot.categoryId,
            catalogItemId: lot.catalogItemId,
            contractNumber: lot.contractNumber,
            entryDate: lot.entryDate,
            specifications: lot.specifications,
          },
          employeeId: dto.employeeId,
          inventoryNumber: dto.inventoryNumber.trim(),
          mergedSpecifications,
          signerId,
          createdByUserId: user.id,
          transferDate,
        });
        const nextOnHand = lot.quantityOnHand - 1;
        await tx.warehouseStockLot.update({
          where: { id: lotId },
          data: {
            quantityOnHand: nextOnHand,
            status: nextOnHand === 0 ? 'zatvoreno' : 'spremno_za_izdavanje',
          },
        });
        return issued;
      });
      await this.transferDocumentGeneration.generateForTransfer(result.transferId).catch(() => undefined);
      await this.notificationsService.notifyTransferSigned(result.transferId);
      return this.findOne(user, lotId);
    } catch {
      throw new ConflictException('Inventory number already exists');
    }
  }

  private async getLotOrThrow(lotId: string): Promise<WarehouseStockLot> {
    const lot = await this.prisma.warehouseStockLot.findUnique({ where: { id: lotId } });
    if (!lot) {
      throw new NotFoundException('Stock lot not found');
    }
    return lot;
  }

  private async assertCanAccessWarehouse(user: AuthenticatedUser, warehouseId: string): Promise<void> {
    if (user.role === 'admin') {
      return;
    }
    if (user.role === 'skladistar') {
      const keeperIds = await loadKeeperWarehouseIds(this.prisma, user.id);
      if (!keeperIds.has(warehouseId)) {
        throw new ForbiddenException('Warehouse outside your assignments');
      }
      return;
    }
    if (user.role === 'evidenticar') {
      const hasAssignment = user.registrarScopes.some((scope) => scope.warehouseId === warehouseId);
      if (!hasAssignment) {
        throw new ForbiddenException('Warehouse outside your assignments');
      }
      return;
    }
    throw new ForbiddenException('Access denied');
  }

  private async assertCanAccessLot(user: AuthenticatedUser, lot: WarehouseStockLot): Promise<void> {
    if (user.role === 'admin') {
      return;
    }
    if (user.role === 'skladistar') {
      const keeperIds = await loadKeeperWarehouseIds(this.prisma, user.id);
      if (!keeperIds.has(lot.warehouseId)) {
        throw new ForbiddenException('Stock lot outside your warehouse');
      }
      return;
    }
    if (user.role === 'evidenticar') {
      await this.registrarScope.assertCanAccessStockLot(user, lot);
      return;
    }
    throw new ForbiddenException('Access denied');
  }

  private mapLotForUser(
    user: AuthenticatedUser,
    lot: WarehouseStockLot & { category?: { id: string; name: string }; warehouse?: { id: string; name: string } },
    includeSpecs = false,
  ) {
    const hideSpecs = user.role === 'skladistar' && !includeSpecs;
    return {
      id: lot.id,
      warehouseId: lot.warehouseId,
      categoryId: lot.categoryId,
      categoryName: lot.category?.name,
      warehouseName: lot.warehouse?.name,
      productName: lot.productName,
      quantityReceived: lot.quantityReceived,
      quantityOnHand: lot.quantityOnHand,
      status: lot.status,
      specifications: hideSpecs ? undefined : lot.specifications,
      contractNumber: lot.contractNumber,
      entryDate: lot.entryDate,
      notes: lot.notes,
      createdAt: lot.createdAt,
      updatedAt: lot.updatedAt,
    };
  }

  private mapLotDetail(
    user: AuthenticatedUser,
    lot: Prisma.WarehouseStockLotGetPayload<{ include: typeof lotInclude }>,
  ) {
    const base = this.mapLotForUser(user, lot, true);
    return {
      ...base,
      receivedBy: lot.receivedBy,
      specDefinedBy: lot.specDefinedBy,
      specDefinedAt: lot.specDefinedAt,
      issuedUnits: lot.issuedUnits,
    };
  }
}
