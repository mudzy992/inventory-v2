import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type WarehouseStockLot } from '../../../generated/prisma/client';
import { InventoryFreezeService } from '../../common/services/inventory-freeze.service';
import { RegistrarScopeService } from '../../common/services/registrar-scope.service';
import { SignerResolutionService } from '../../common/services/signer-resolution.service';
import { WarehouseResolutionService } from '../../common/services/warehouse-resolution.service';
import { assertUniqueUnitSpecificationValues } from '../../common/utils/assert-unique-spec-values.util';
import {
  hasRequiredLotSpecFields,
  validateIssueSpecifications,
  validateLotSpecifications,
} from '../../common/utils/category-fields.util';
import { loadKeeperWarehouseIds } from '../../common/utils/warehouse-keeper-access.util';
import {
  buildPaginatedResponse,
  type PaginatedResponse,
} from '../../common/types/paginated-response.type';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import {
  buildContainsSearchWhere,
  buildOrderBy,
  paginate,
  parsePagination,
  resolveListPageSize,
} from '../../common/utils/pagination.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CategoriesService } from '../categories/categories.service';
import { EquipmentCatalogService } from '../equipment-catalog/equipment-catalog.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';
import { WarehousesService } from '../warehouses/warehouses.service';
import { BulkCreateStockLotDto } from './dto/bulk-create-stock-lot.dto';
import { CreateStockLotDto } from './dto/create-stock-lot.dto';
import { IssueStockLotDto } from './dto/issue-stock-lot.dto';
import { ListStockLotsQueryDto } from './dto/list-stock-lots-query.dto';
import { UpdateStockLotSpecDto } from './dto/update-stock-lot-spec.dto';

const STOCK_LOT_SORT_FIELDS: Record<string, string> = {
  entryDate: 'entryDate',
  createdAt: 'createdAt',
  productName: 'productName',
  status: 'status',
};
import { TransferDocumentGenerationService } from '../transfers/transfer-document-generation.service';
import { isStockLotTransferDocumentEnabled } from '../transfers/utils/transfer-generation-policy.util';
import {
  executeStockLotIssueDirectInTx,
  executeStockLotIssueWithTransferInTx,
} from './utils/finalize-stock-lot-issue.util';
import { applyCrossWarehouseIssueLotUpdatesInTx } from './utils/cross-warehouse-issue.util';
import { resolveTransferSignerId } from '../transfers/utils/resolve-transfer-signer.util';
import {
  buildStockLotGroupKey,
  buildStockLotGroupWhere,
} from './utils/stock-lot-group-key.util';
export interface StockLotProductGroup {
  groupKey: string;
  productName: string;
  categoryId: string;
  categoryName: string;
  catalogItemId: string | null;
  warehouseCount: number;
  totalOnHand: number;
  totalReceived: number;
  awaitingSpecCount: number;
  readyToIssueCount: number;
}

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
      currentHolder: {
        select: { id: true, firstName: true, lastName: true, orgUnitId: true },
      },
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
    private readonly warehouseResolution: WarehouseResolutionService,
  ) {}

  async listForWarehouse(
    user: AuthenticatedUser,
    warehouseId: string,
    query: ListStockLotsQueryDto,
  ): Promise<PaginatedResponse<ReturnType<typeof this.mapLotForUser>>> {
    await this.assertCanAccessWarehouse(user, warehouseId);
    const { pageSize, maxPageSize } = await resolveListPageSize(query.pageSize, this.settingsService);
    const { page, take } = parsePagination(query, { defaultPageSize: pageSize, maxPageSize });
    const filters: Prisma.WarehouseStockLotWhereInput[] = [
      { warehouseId, lotKind: 'ISSUABLE' },
    ];
    const searchWhere = buildContainsSearchWhere(query.search, ['productName']);
    if (searchWhere) {
      filters.push(searchWhere);
    }
    const where: Prisma.WarehouseStockLotWhereInput =
      filters.length === 1 ? filters[0]! : { AND: filters };
    const orderBy = buildOrderBy(query.sortBy, query.sortDir, STOCK_LOT_SORT_FIELDS, 'entryDate');
    const result = await paginate({
      findMany: (args) =>
        this.prisma.warehouseStockLot.findMany({
          ...args,
          include: { category: true },
        }),
      count: (args) => this.prisma.warehouseStockLot.count(args),
      where,
      orderBy,
      page,
      pageSize: take,
    });
    return {
      items: result.items.map((lot) => this.mapLotForUser(user, lot)),
      meta: result.meta,
    };
  }

  async listForRegistrar(
    user: AuthenticatedUser,
    query: ListStockLotsQueryDto,
  ): Promise<PaginatedResponse<ReturnType<typeof this.mapLotForUser>>> {
    if (user.role !== 'evidenticar' && user.role !== 'admin') {
      throw new ForbiddenException('Only registrar or admin can list assigned stock');
    }
    const { pageSize, maxPageSize } = await resolveListPageSize(query.pageSize, this.settingsService);
    const { page, take } = parsePagination(query, { defaultPageSize: pageSize, maxPageSize });
    const where = await this.buildAssignedLotsWhere(user, query);
    const orderBy = buildOrderBy(query.sortBy, query.sortDir, STOCK_LOT_SORT_FIELDS, 'status');
    const result = await paginate({
      findMany: (args) =>
        this.prisma.warehouseStockLot.findMany({
          ...args,
          include: { category: true, warehouse: true },
        }),
      count: (args) => this.prisma.warehouseStockLot.count(args),
      where,
      orderBy,
      page,
      pageSize: take,
    });
    return {
      items: result.items.map((lot) => this.mapLotForUser(user, lot, true)),
      meta: result.meta,
    };
  }

  async listAssignedGroups(
    user: AuthenticatedUser,
    query: ListStockLotsQueryDto,
  ): Promise<PaginatedResponse<StockLotProductGroup>> {
    if (user.role !== 'evidenticar' && user.role !== 'admin') {
      throw new ForbiddenException('Only registrar or admin can list assigned stock groups');
    }
    const { pageSize, maxPageSize } = await resolveListPageSize(query.pageSize, this.settingsService);
    const { page, skip, take } = parsePagination(query, { defaultPageSize: pageSize, maxPageSize });
    const where = await this.buildAssignedLotsWhere(user, query);
    const lots = await this.prisma.warehouseStockLot.findMany({
      where,
      select: {
        warehouseId: true,
        catalogItemId: true,
        categoryId: true,
        productName: true,
        quantityOnHand: true,
        quantityReceived: true,
        status: true,
        category: { select: { name: true } },
      },
    });
    const groupMap = new Map<string, StockLotProductGroup>();
    const warehouseIdsByGroup = new Map<string, Set<string>>();
    for (const lot of lots) {
      const groupKey = buildStockLotGroupKey(lot);
      const warehouseIds = warehouseIdsByGroup.get(groupKey) ?? new Set<string>();
      warehouseIds.add(lot.warehouseId);
      warehouseIdsByGroup.set(groupKey, warehouseIds);
      const existing = groupMap.get(groupKey);
      if (existing) {
        existing.warehouseCount = warehouseIds.size;
        existing.totalOnHand += lot.quantityOnHand;
        existing.totalReceived += lot.quantityReceived;
        if (lot.status === 'ceka_specifikaciju') {
          existing.awaitingSpecCount += 1;
        }
        if (lot.status === 'spremno_za_izdavanje') {
          existing.readyToIssueCount += 1;
        }
        continue;
      }
      groupMap.set(groupKey, {
        groupKey,
        productName: lot.productName,
        categoryId: lot.categoryId,
        categoryName: lot.category.name,
        catalogItemId: lot.catalogItemId,
        warehouseCount: warehouseIds.size,
        totalOnHand: lot.quantityOnHand,
        totalReceived: lot.quantityReceived,
        awaitingSpecCount: lot.status === 'ceka_specifikaciju' ? 1 : 0,
        readyToIssueCount: lot.status === 'spremno_za_izdavanje' ? 1 : 0,
      });
    }
    const groups = [...groupMap.values()].sort((a, b) =>
      a.productName.localeCompare(b.productName, 'bs'),
    );
    const items = groups.slice(skip, skip + take);
    return buildPaginatedResponse(items, groups.length, page, take);
  }

  private async buildAssignedLotsWhere(
    user: AuthenticatedUser,
    query: ListStockLotsQueryDto,
  ): Promise<Prisma.WarehouseStockLotWhereInput> {
    const filters: Prisma.WarehouseStockLotWhereInput[] = [
      {
        lotKind: 'ISSUABLE',
        ...(query.status
          ? { status: query.status }
          : { status: { in: ['ceka_specifikaciju', 'spremno_za_izdavanje'] } }),
      },
    ];
    if (user.role === 'evidenticar') {
      const scopeWhere = await this.registrarScope.buildStockLotWhere(user);
      filters.push(scopeWhere);
    }
    if (query.warehouseId) {
      filters.push({ warehouseId: query.warehouseId });
    }
    if (query.categoryId) {
      filters.push({ categoryId: query.categoryId });
    }
    if (query.groupKey?.trim()) {
      try {
        filters.push(buildStockLotGroupWhere(query.groupKey.trim()));
      } catch {
        throw new BadRequestException('Invalid groupKey');
      }
    }
    const searchWhere = buildContainsSearchWhere(query.search, ['productName']);
    if (searchWhere) {
      filters.push(searchWhere);
    }
    return { AND: filters };
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
    const { optionalFields } = this.categoriesService.getFieldDefinitions(category);
    const initialStatus = hasRequiredLotSpecFields(optionalFields)
      ? 'ceka_specifikaciju'
      : 'spremno_za_izdavanje';
    const lot = await this.prisma.warehouseStockLot.create({
      data: {
        warehouseId,
        categoryId: dto.categoryId,
        catalogItemId: resolved.catalogItemId,
        lotKind: 'ISSUABLE',
        productName: resolved.productName,
        quantityReceived: dto.quantity,
        quantityOnHand: dto.quantity,
        status: initialStatus,
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
        const { optionalFields } = this.categoriesService.getFieldDefinitions(category);
        const initialStatus = hasRequiredLotSpecFields(optionalFields)
          ? 'ceka_specifikaciju'
          : 'spremno_za_izdavanje';
        const lot = await tx.warehouseStockLot.create({
          data: {
            warehouseId,
            categoryId: item.categoryId,
            catalogItemId: resolved.catalogItemId,
            lotKind: 'ISSUABLE',
            productName: resolved.productName,
            quantityReceived: item.quantity,
            quantityOnHand: item.quantity,
            status: initialStatus,
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
    const { optionalFields } = this.categoriesService.getFieldDefinitions(category);
    validateLotSpecifications(dto.specifications, optionalFields);
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
    validateIssueSpecifications(dto.uniqueSpecifications, fields);
    await assertUniqueUnitSpecificationValues(
      this.prisma,
      lot.categoryId,
      dto.uniqueSpecifications,
      fields,
    );
    const holder = await this.prisma.employee.findUnique({ where: { id: dto.employeeId } });
    if (!holder) {
      throw new NotFoundException('Employee not found');
    }
    const canHolder = await this.registrarScope.canAccessEmployee(user, holder);
    if (!canHolder) {
      throw new ForbiddenException('Employee outside your scope');
    }
    const destWarehouseId = await this.warehouseResolution.resolveForOrgUnit(holder.orgUnitId);
    const isCrossWarehouse =
      destWarehouseId !== null && destWarehouseId !== lot.warehouseId;
    if (isCrossWarehouse) {
      if (user.role !== 'admin') {
        throw new ForbiddenException('Cross-warehouse issue is only available to administrator');
      }
      await this.settingsService.assertFeatureEnabled('transfer.allow_admin_cross_warehouse_issue');
      if (!lot.catalogItemId) {
        throw new BadRequestException('Source lot must have catalog item for cross-warehouse issue');
      }
      const destWarehouse = await this.prisma.warehouse.findUnique({
        where: { id: destWarehouseId },
        select: { cityId: true },
      });
      if (destWarehouse) {
        await this.inventoryFreeze.assertNoMutationInCity(
          destWarehouse.cityId,
          user,
          'stock_lot_issue',
        );
      }
    }
    let catalogItemName = lot.productName;
    if (isCrossWarehouse && lot.catalogItemId) {
      const catalogItem = await this.prisma.equipmentCatalogItem.findUnique({
        where: { id: lot.catalogItemId },
        select: { name: true },
      });
      if (catalogItem) {
        catalogItemName = catalogItem.name;
      }
    }
    const lotSpecs = (lot.specifications ?? {}) as Record<string, string>;
    const mergedSpecifications = { ...lotSpecs, ...dto.uniqueSpecifications };
    const transferDocumentEnabled = await isStockLotTransferDocumentEnabled(this.settingsService);
    const lotInput = {
      id: lot.id,
      warehouseId: lot.warehouseId,
      categoryId: lot.categoryId,
      catalogItemId: lot.catalogItemId,
      contractNumber: lot.contractNumber,
      entryDate: lot.entryDate,
      specifications: lot.specifications,
    };
    const issueBase = {
      lot: lotInput,
      employeeId: dto.employeeId,
      inventoryNumber: dto.inventoryNumber.trim(),
      mergedSpecifications,
    };
    let transferIssueInput:
      | {
          signerId: string;
          createdByUserId: string;
          transferDate: Date;
        }
      | undefined;
    if (transferDocumentEnabled) {
      const signerResolved = dto.signerId
        ? dto.signerId
        : await resolveTransferSignerId(this.signerResolutionService, {
            type: 'zaduzenje',
            toPersonId: dto.employeeId,
          });
      transferIssueInput = {
        signerId: this.signerResolutionService.assertEffectiveSignerConfigured(signerResolved),
        createdByUserId: user.id,
        transferDate: dto.date ? new Date(dto.date) : new Date(),
      };
    }
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const issued = transferIssueInput
          ? await executeStockLotIssueWithTransferInTx(tx, {
              ...issueBase,
              ...transferIssueInput,
            })
          : await executeStockLotIssueDirectInTx(tx, issueBase);
        const nextOnHand = lot.quantityOnHand - 1;
        await tx.warehouseStockLot.update({
          where: { id: lotId },
          data: {
            quantityOnHand: nextOnHand,
            status: nextOnHand === 0 ? 'zatvoreno' : 'spremno_za_izdavanje',
          },
        });
        if (isCrossWarehouse && destWarehouseId && lot.catalogItemId) {
          await applyCrossWarehouseIssueLotUpdatesInTx(tx, {
            equipmentId: issued.equipmentId,
            sourceLotId: lot.id,
            sourceWarehouseId: lot.warehouseId,
            destWarehouseId,
            categoryId: lot.categoryId,
            catalogItemId: lot.catalogItemId,
            catalogItemName,
            actorUserId: user.id,
            fields,
            optionalFields,
          });
        }
        return issued;
      });
      if (result.transferId) {
        await this.transferDocumentGeneration
          .generateForTransfer(result.transferId)
          .catch(() => undefined);
        await this.notificationsService.notifyTransferSigned(result.transferId);
      }
      return this.findOne(user, lotId);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Inventory number already exists');
      }
      throw err;
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
