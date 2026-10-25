import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type WarehouseStockLot } from '../../../generated/prisma/client';
import { InventoryFreezeService } from '../../common/services/inventory-freeze.service';
import { ModeratorScopeService } from '../../common/services/moderator-scope.service';
import { RegistrarScopeService } from '../../common/services/registrar-scope.service';
import { SignerResolutionService } from '../../common/services/signer-resolution.service';
import { WarehouseResolutionService } from '../../common/services/warehouse-resolution.service';
import { assertUniqueUnitSpecificationValues } from '../../common/utils/assert-unique-spec-values.util';
import {
  hasRequiredLotSpecFields,
  sanitizeLotSpecifications,
  validateIssueSpecifications,
  validateLotSpecifications,
} from '../../common/utils/category-fields.util';
import { loadKeeperWarehouseIds } from '../../common/utils/warehouse-keeper-access.util';
import { WAREHOUSE_STOCK_MESSAGES } from '../../common/utils/warehouse-stock-messages.util';
import {
  assertEquipmentAccountingFields,
  resolveIssueAccountingFields,
} from '../../common/utils/equipment-accounting-tracked.util';
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
import { assertEmployeeActiveForAssignment } from '../employees/utils/assert-employee-active-for-assignment.util';
import { CategoriesService } from '../categories/categories.service';
import { EquipmentCatalogService } from '../equipment-catalog/equipment-catalog.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';
import { WarehousesService } from '../warehouses/warehouses.service';
import { BulkCreateStockLotDto } from './dto/bulk-create-stock-lot.dto';
import { CreateStockLotDto } from './dto/create-stock-lot.dto';
import { CommissionStockLotDto } from './dto/commission-stock-lot.dto';
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
import { executeStockLotCommissionInTx } from './utils/finalize-stock-lot-commission.util';
import {
  executeStockLotIssueDirectInTx,
  executeStockLotIssueWithTransferInTx,
} from './utils/finalize-stock-lot-issue.util';
import { applyCrossWarehouseIssueLotUpdatesInTx } from './utils/cross-warehouse-issue.util';
import { resolveTransferSignerId } from '../transfers/utils/resolve-transfer-signer.util';
import {
  buildStockLotGroupWhere,
} from './utils/stock-lot-group-key.util';
import { applyStockLotReceiveInTx } from './utils/apply-stock-lot-receive.util';
import { findCanonicalStockLotInTx } from './utils/find-canonical-stock-lot.util';
import { consumeStockLotReceiptFifoInTx } from './utils/consume-stock-lot-receipt-fifo.util';
import { decrementStockLotOnHandInTx } from './utils/decrement-stock-lot-on-hand.util';
import {
  applyHistoricalTotalsToProductGroups,
  buildStockLotHistoricalTotalsByGroup,
  buildStockLotProductGroupsFromLots,
} from './utils/build-stock-lot-group-aggregates.util';
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
      isAccountingTracked: true,
      affiliation: true,
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
    private readonly moderatorScope: ModeratorScopeService,
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
    const lotSelect = {
      warehouseId: true,
      catalogItemId: true,
      categoryId: true,
      productName: true,
      quantityOnHand: true,
      quantityReceived: true,
      status: true,
      category: { select: { name: true } },
    } as const;
    const lots = await this.prisma.warehouseStockLot.findMany({
      where,
      select: lotSelect,
    });
    let groups = buildStockLotProductGroupsFromLots(lots);
    if (!query.status) {
      const historicalWhere = await this.buildAssignedLotsWhere(user, query, { allStatuses: true });
      const allLots = await this.prisma.warehouseStockLot.findMany({
        where: historicalWhere,
        select: lotSelect,
      });
      const historicalByGroup = buildStockLotHistoricalTotalsByGroup(allLots);
      groups = applyHistoricalTotalsToProductGroups(groups, historicalByGroup);
    }
    const items = groups.slice(skip, skip + take);
    return buildPaginatedResponse(items, groups.length, page, take);
  }

  private async buildAssignedLotsWhere(
    user: AuthenticatedUser,
    query: ListStockLotsQueryDto,
    options?: { allStatuses?: boolean },
  ): Promise<Prisma.WarehouseStockLotWhereInput> {
    const filters: Prisma.WarehouseStockLotWhereInput[] = [
      {
        lotKind: 'ISSUABLE',
        ...(options?.allStatuses
          ? {}
          : query.status
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

  async receivePreview(user: AuthenticatedUser, warehouseId: string, catalogItemId: string) {
    await this.settingsService.assertFeatureEnabled('features.registrar_stock');
    await this.assertCanReceiveOnWarehouse(user, warehouseId);
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: warehouseId },
      select: { isActive: true },
    });
    if (!warehouse?.isActive) {
      throw new BadRequestException('Warehouse not found or inactive');
    }
    const openLot = await this.prisma.warehouseStockLot.findFirst({
      where: {
        warehouseId,
        catalogItemId,
        lotKind: 'ISSUABLE',
        status: { not: 'zatvoreno' },
      },
      orderBy: { createdAt: 'asc' },
    });
    const closedLot = openLot
      ? null
      : await this.prisma.warehouseStockLot.findFirst({
          where: { warehouseId, catalogItemId, lotKind: 'ISSUABLE', status: 'zatvoreno' },
          orderBy: { createdAt: 'desc' },
        });
    const lot = openLot ?? closedLot;
    if (!lot) {
      return {
        exists: false,
        willIncrement: false,
        message:
          'Za traženi tip ne postoji lot u ovom skladištu. Prijem će kreirati novi lot i povećati stanje.',
      };
    }
    const baseMessage =
      'Za traženi tip već postoji lot u ovom skladištu. Prijem će uvećati stanje; specifikacija ostaje ista.';
    const reopenMessage =
      lot.status === 'zatvoreno'
        ? ' Lot je trenutno zatvoren (nema komada na stanju) i biće ponovo otvoren ovim prijemom.'
        : '';
    return {
      exists: true,
      willIncrement: true,
      lotId: lot.id,
      productName: lot.productName,
      currentOnHand: lot.quantityOnHand,
      currentReceived: lot.quantityReceived,
      status: lot.status,
      message: `${baseMessage}${reopenMessage}`,
    };
  }

  async receive(user: AuthenticatedUser, warehouseId: string, dto: CreateStockLotDto) {
    await this.settingsService.assertFeatureEnabled('features.registrar_stock');
    await this.assertCanReceiveOnWarehouse(user, warehouseId);
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: warehouseId },
      select: { cityId: true, isActive: true },
    });
    if (!warehouse?.isActive) {
      throw new BadRequestException('Warehouse not found or inactive');
    }
    await this.inventoryFreeze.assertNoMutationInWarehouse(warehouseId, user, 'stock_lot_create');
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
    const contractNumber = dto.contractNumber?.trim() || null;
    const notes = dto.notes?.trim() || null;
    const entryDate = new Date(dto.entryDate);
    const result = await this.prisma.$transaction(async (tx) => {
      const canonical =
        resolved.catalogItemId
          ? await findCanonicalStockLotInTx(tx, { warehouseId, catalogItemId: resolved.catalogItemId })
          : null;
      const statusIfReopened =
        canonical?.specDefinedAt || initialStatus === 'spremno_za_izdavanje'
          ? 'spremno_za_izdavanje'
          : 'ceka_specifikaciju';
      const applied = await applyStockLotReceiveInTx(tx, canonical?.id ?? null, {
        warehouseId,
        categoryId: dto.categoryId,
        catalogItemId: resolved.catalogItemId ?? null,
        productName: resolved.productName,
        quantity: dto.quantity,
        entryDate,
        contractNumber,
        notes,
        receivedByUserId: user.id,
        statusIfCreated: initialStatus,
        statusIfReopened,
      });
      const lot = await tx.warehouseStockLot.findUnique({
        where: { id: applied.stockLotId },
        include: { category: true, warehouse: true },
      });
      if (!lot) {
        throw new NotFoundException('Stock lot not found');
      }
      return lot;
    });
    await this.notificationsService.notifyWarehouseStockReceived(result.id);
    return this.mapLotForUser(user, result, true);
  }

  async receiveBulk(user: AuthenticatedUser, warehouseId: string, dto: BulkCreateStockLotDto) {
    await this.settingsService.assertFeatureEnabled('features.registrar_stock');
    await this.assertCanReceiveOnWarehouse(user, warehouseId);
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: warehouseId },
      select: { cityId: true, isActive: true },
    });
    if (!warehouse?.isActive) {
      throw new BadRequestException('Warehouse not found or inactive');
    }
    await this.inventoryFreeze.assertNoMutationInWarehouse(warehouseId, user, 'stock_lot_create');
    const lotIds = await this.prisma.$transaction(async (tx) => {
      const ids: string[] = [];
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
        const canonical = await findCanonicalStockLotInTx(tx, {
          warehouseId,
          catalogItemId: item.catalogItemId,
        });
        const statusIfReopened =
          canonical?.specDefinedAt || initialStatus === 'spremno_za_izdavanje'
            ? 'spremno_za_izdavanje'
            : 'ceka_specifikaciju';
        const applied = await applyStockLotReceiveInTx(tx, canonical?.id ?? null, {
          warehouseId,
          categoryId: item.categoryId,
          catalogItemId: item.catalogItemId,
          productName: resolved.productName,
          quantity: item.quantity,
          entryDate: new Date(item.entryDate),
          contractNumber: item.contractNumber?.trim() || null,
          notes: null,
          receivedByUserId: user.id,
          statusIfCreated: initialStatus,
          statusIfReopened,
        });
        ids.push(applied.stockLotId);
      }
      return ids;
    });
    const distinctLotIds = [...new Set(lotIds)];
    const lots = await this.prisma.warehouseStockLot.findMany({
      where: { id: { in: distinctLotIds } },
      include: { category: true, warehouse: true },
    });
    for (const lotId of distinctLotIds) {
      await this.notificationsService.notifyWarehouseStockReceived(lotId);
    }
    return lots.map((lot) => this.mapLotForUser(user, lot, true));
  }

  async defineSpecifications(
    user: AuthenticatedUser,
    lotId: string,
    dto: UpdateStockLotSpecDto,
  ) {
    await this.settingsService.assertFeatureEnabled('features.registrar_stock');
    if (user.role !== 'evidenticar' && user.role !== 'admin') {
      throw new ForbiddenException('Only registrar can define stock specifications');
    }
    const lot = await this.getLotOrThrow(lotId);
    await this.registrarScope.assertCanAccessStockLot(user, lot);
    if (lot.status === 'zatvoreno') {
      throw new BadRequestException(WAREHOUSE_STOCK_MESSAGES.lotClosed);
    }
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: lot.warehouseId },
      select: { id: true, cityId: true },
    });
    if (warehouse) {
      await this.inventoryFreeze.assertNoMutationInWarehouse(warehouse.id, user, 'stock_lot_issue');
    }
    const category = await this.categoriesService.assertLeafCategory(lot.categoryId);
    const { optionalFields } = this.categoriesService.getFieldDefinitions(category);
    const sanitizedSpecifications = sanitizeLotSpecifications(dto.specifications, optionalFields);
    validateLotSpecifications(sanitizedSpecifications, optionalFields);
    const updated = await this.prisma.warehouseStockLot.update({
      where: { id: lotId },
      data: {
        specifications: sanitizedSpecifications,
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
    await this.settingsService.assertFeatureEnabled('features.transfers');
    if (
      user.role !== 'evidenticar' &&
      user.role !== 'admin' &&
      !this.moderatorScope.isModerator(user)
    ) {
      throw new ForbiddenException('Only registrar, admin, or moderator can issue stock');
    }
    const lot = await this.getLotOrThrow(lotId);
    if (lot.lotKind === 'MAINTENANCE') {
      throw new BadRequestException('Maintenance stock lots cannot issue equipment units');
    }
    await this.assertCanAccessLot(user, lot);
    if (lot.status !== 'spremno_za_izdavanje') {
      throw new BadRequestException('Define lot specifications before issuing units');
    }
    if (lot.quantityOnHand <= 0) {
      throw new BadRequestException('No units remaining on this lot');
    }
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: lot.warehouseId },
      select: { id: true, cityId: true },
    });
    if (warehouse) {
      await this.inventoryFreeze.assertNoMutationInWarehouse(warehouse.id, user, 'stock_lot_issue');
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
    await assertEmployeeActiveForAssignment(this.prisma, dto.employeeId);
    if (this.moderatorScope.isModerator(user)) {
      await this.moderatorScope.assertEmployeeInScope(user, dto.employeeId);
    } else {
      const canHolder = await this.registrarScope.canAccessEmployee(user, holder);
      if (!canHolder) {
        throw new ForbiddenException('Employee outside your scope');
      }
    }
    const destWarehouseId = await this.warehouseResolution.resolveForOrgUnit(holder.orgUnitId);
    const isCrossWarehouse =
      destWarehouseId !== null && destWarehouseId !== lot.warehouseId;
    if (isCrossWarehouse) {
      if (user.role !== 'admin' && !this.moderatorScope.isModerator(user)) {
        throw new ForbiddenException(WAREHOUSE_STOCK_MESSAGES.crossWarehouseAdminOnly);
      }
      await this.settingsService.assertFeatureEnabled('transfer.allow_admin_cross_warehouse_issue');
      if (!lot.catalogItemId) {
        throw new BadRequestException(WAREHOUSE_STOCK_MESSAGES.catalogItemRequired);
      }
      const destWarehouse = await this.prisma.warehouse.findUnique({
        where: { id: destWarehouseId },
        select: { id: true },
      });
      if (destWarehouse) {
        await this.inventoryFreeze.assertNoMutationInWarehouse(
          destWarehouse.id,
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
    const accountingFields = resolveIssueAccountingFields({
      isAccountingTracked: dto.isAccountingTracked,
      inventoryNumber: dto.inventoryNumber,
    });
    assertEquipmentAccountingFields(accountingFields);
    const useTransferDocument =
      accountingFields.isAccountingTracked &&
      (await isStockLotTransferDocumentEnabled(this.settingsService));
    const lotInput = {
      id: lot.id,
      warehouseId: lot.warehouseId,
      categoryId: lot.categoryId,
      catalogItemId: lot.catalogItemId,
      specifications: lot.specifications,
    };
    const issueBase = {
      lot: lotInput,
      employeeId: dto.employeeId,
      inventoryNumber: accountingFields.inventoryNumber,
      isAccountingTracked: accountingFields.isAccountingTracked,
      affiliation: dto.affiliation,
      mergedSpecifications,
    };
    let transferIssueInput:
      | {
          signerId: string;
          createdByUserId: string;
          transferDate: Date;
        }
      | undefined;
    if (useTransferDocument) {
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
        const receipt = await consumeStockLotReceiptFifoInTx(tx, lot.id);
        const issued = transferIssueInput
          ? await executeStockLotIssueWithTransferInTx(tx, {
              ...issueBase,
              receipt,
              ...transferIssueInput,
            })
          : await executeStockLotIssueDirectInTx(tx, { ...issueBase, receipt });
        await decrementStockLotOnHandInTx(tx, lotId);
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
        await this.transferDocumentGeneration.generateForTransfer(result.transferId);
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

  async commissionUnit(user: AuthenticatedUser, lotId: string, dto: CommissionStockLotDto) {
    await this.settingsService.assertFeatureEnabled('features.registrar_stock');
    if (user.role !== 'evidenticar' && user.role !== 'admin') {
      throw new ForbiddenException('Only registrar can commission stock');
    }
    const lot = await this.getLotOrThrow(lotId);
    if (lot.lotKind === 'MAINTENANCE') {
      throw new BadRequestException('Maintenance stock lots cannot commission equipment units');
    }
    await this.registrarScope.assertCanAccessStockLot(user, lot);
    if (lot.status !== 'spremno_za_izdavanje') {
      throw new BadRequestException('Define lot specifications before commissioning units');
    }
    if (lot.quantityOnHand <= 0) {
      throw new BadRequestException('No units remaining on this lot');
    }
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: lot.warehouseId },
      select: { id: true, cityId: true },
    });
    if (warehouse) {
      await this.inventoryFreeze.assertNoMutationInWarehouse(warehouse.id, user, 'stock_lot_issue');
    }
    const category = await this.categoriesService.assertLeafCategory(lot.categoryId);
    const { fields } = this.categoriesService.getFieldDefinitions(category);
    validateIssueSpecifications(dto.uniqueSpecifications, fields);
    await assertUniqueUnitSpecificationValues(
      this.prisma,
      lot.categoryId,
      dto.uniqueSpecifications,
      fields,
    );
    const lotSpecs = (lot.specifications ?? {}) as Record<string, string>;
    const mergedSpecifications = { ...lotSpecs, ...dto.uniqueSpecifications };
    const accountingFields = resolveIssueAccountingFields({
      isAccountingTracked: dto.isAccountingTracked,
      inventoryNumber: dto.inventoryNumber,
    });
    assertEquipmentAccountingFields(accountingFields);
    const lotInput = {
      id: lot.id,
      warehouseId: lot.warehouseId,
      categoryId: lot.categoryId,
      catalogItemId: lot.catalogItemId,
    };
    try {
      await this.prisma.$transaction(async (tx) => {
        const receipt = await consumeStockLotReceiptFifoInTx(tx, lot.id);
        await executeStockLotCommissionInTx(tx, {
          lot: lotInput,
          receipt,
          inventoryNumber: accountingFields.inventoryNumber,
          isAccountingTracked: accountingFields.isAccountingTracked,
          affiliation: dto.affiliation,
          mergedSpecifications,
        });
        await decrementStockLotOnHandInTx(tx, lotId);
      });
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

  private async assertCanReceiveOnWarehouse(
    user: AuthenticatedUser,
    warehouseId: string,
  ): Promise<void> {
    if (user.role === 'admin') {
      return;
    }
    if (user.role === 'skladistar') {
      await this.warehousesService.assertKeeperCanManageWarehouse(user, warehouseId);
      return;
    }
    if (this.moderatorScope.isModerator(user)) {
      await this.moderatorScope.assertWarehouseAssigned(user, warehouseId);
      return;
    }
    throw new ForbiddenException('Only warehouse keeper, admin, or moderator can receive stock');
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
    if (this.moderatorScope.isModerator(user)) {
      await this.moderatorScope.assertWarehouseAssigned(user, warehouseId);
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
    if (this.moderatorScope.isModerator(user)) {
      await this.moderatorScope.assertWarehouseAssigned(user, lot.warehouseId);
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
      catalogItemId: lot.catalogItemId,
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
