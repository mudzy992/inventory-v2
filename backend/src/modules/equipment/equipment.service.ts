import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Equipment, EquipmentStatus, Prisma, Employee } from '../../../generated/prisma/client';
import { InventoryFreezeService } from '../../common/services/inventory-freeze.service';
import { RegistrarScopeService } from '../../common/services/registrar-scope.service';
import { ModeratorScopeService } from '../../common/services/moderator-scope.service';
import type { PaginatedResponse } from '../../common/types/paginated-response.type';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import {
  resolveEquipmentDisposalReason,
  resolveEquipmentDisposalReasonsBatch,
} from '../../common/utils/resolve-equipment-disposal-reason.util';
import { validateEquipmentSpecifications } from '../../common/utils/category-fields.util';
import { resolveRegistrarEquipmentSpecifications } from '../../common/utils/registrar-equipment-spec.util';
import { buildSpecificationFieldFilter } from '../../common/utils/json-specification-filter.util';
import {
  buildEquipmentSearchWhere,
  collectCategoryTextFieldIds,
} from '../../common/utils/build-equipment-search-where.util';
import { isOwnHeldEquipmentListQuery } from '../../common/utils/self-profile-access.util';
import { findEquipmentIdsBySpecificationSearch } from '../../common/utils/find-equipment-ids-by-specification-search.util';
import { findEmployeeIdsByHolderSearch } from '../../common/utils/find-employee-ids-by-holder-search.util';
import {
  assertEquipmentAccountingUpgrade,
  normalizeInventoryNumber,
} from '../../common/utils/equipment-accounting-tracked.util';
import { CUSTODY_POOL_LOOKUP_NOT_FOUND_MESSAGE } from '../../common/utils/equipment-custody.util';
import {
  buildOrderBy,
  paginate,
  parsePagination,
  resolveListPageSize,
} from '../../common/utils/pagination.util';
import { PrismaService } from '../../prisma/prisma.service';
import { escapeCsvCell } from '../../common/utils/csv-cell.util';
import { SettingsService } from '../settings/settings.service';
import { WarehousesService } from '../warehouses/warehouses.service';
import { CategoriesService } from '../categories/categories.service';
import {
  assertCanReadEquipment,
  assertCanWriteEquipment,
} from './equipment-access.util';
import { CreateEquipmentDto } from './dto/create-equipment.dto';
import { ListEquipmentQueryDto } from './dto/list-equipment-query.dto';
import { UpdateEquipmentDto } from './dto/update-equipment.dto';

const EQUIPMENT_LIST_INCLUDE = {
  currentHolder: { select: { id: true, firstName: true, lastName: true, orgUnitId: true } },
  category: { select: { id: true, name: true, parentId: true } },
  stockLot: { select: { id: true, productName: true } },
} satisfies Prisma.EquipmentInclude;

const EQUIPMENT_SORT_FIELDS: Record<string, string> = {
  inventoryNumber: 'inventoryNumber',
  entryDate: 'entryDate',
  status: 'status',
  createdAt: 'createdAt',
};

export interface EquipmentWithDisposalReason extends Equipment {
  disposalReason?: string | null;
}

export interface EquipmentSummary {
  total: number;
  byStatus: Record<EquipmentStatus, number>;
}

export interface EquipmentLotGroup {
  stockLotId: string | null;
  productName: string;
  count: number;
}

@Injectable()
export class EquipmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categoriesService: CategoriesService,
    private readonly registrarScope: RegistrarScopeService,
    private readonly moderatorScope: ModeratorScopeService,
    private readonly configService: ConfigService,
    private readonly warehousesService: WarehousesService,
    private readonly inventoryFreeze: InventoryFreezeService,
    private readonly settingsService: SettingsService,
  ) {}

  async findAll(
    user: AuthenticatedUser,
    query: ListEquipmentQueryDto,
  ): Promise<PaginatedResponse<EquipmentWithDisposalReason>> {
    await this.settingsService.assertFeatureEnabled('features.equipment');
    const { pageSize, maxPageSize } = await resolveListPageSize(query.pageSize, this.settingsService);
    const { page, take } = parsePagination(query, { defaultPageSize: pageSize, maxPageSize });
    const where = await this.buildListWhere(user, query);
    const orderBy = buildOrderBy(
      query.sortBy,
      query.sortDir,
      EQUIPMENT_SORT_FIELDS,
      'inventoryNumber',
    );
    const result = await paginate({
      findMany: (args) =>
        this.prisma.equipment.findMany({
          ...args,
          include: EQUIPMENT_LIST_INCLUDE,
        }),
      count: (args) => this.prisma.equipment.count(args),
      where,
      orderBy,
      page,
      pageSize: take,
    });
    const disposalReasons = await resolveEquipmentDisposalReasonsBatch(this.prisma, result.items);
    return {
      items: result.items.map((item) => ({
        ...item,
        disposalReason: disposalReasons.get(item.id) ?? null,
      })),
      meta: result.meta,
    };
  }

  async getSummary(user: AuthenticatedUser, categoryId?: string): Promise<EquipmentSummary> {
    await this.settingsService.assertFeatureEnabled('features.equipment');
    const scopeWhere = await this.buildOperationalEquipmentScopeWhere(user);
    const where: Prisma.EquipmentWhereInput = categoryId
      ? { AND: [scopeWhere, { categoryId }] }
      : scopeWhere;
    const grouped = await this.prisma.equipment.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    });
    const byStatus = {
      skladiste: 0,
      zaduzeno: 0,
      za_rashod: 0,
      rashodovano: 0,
    } satisfies Record<EquipmentStatus, number>;
    let total = 0;
    for (const row of grouped) {
      byStatus[row.status] = row._count._all;
      total += row._count._all;
    }
    return { total, byStatus };
  }

  async getLotGroups(user: AuthenticatedUser, categoryId: string): Promise<EquipmentLotGroup[]> {
    await this.settingsService.assertFeatureEnabled('features.equipment');
    const scopeWhere = await this.buildOperationalEquipmentScopeWhere(user);
    const where: Prisma.EquipmentWhereInput = { AND: [scopeWhere, { categoryId }] };
    const grouped = await this.prisma.equipment.groupBy({
      by: ['stockLotId'],
      where,
      _count: { _all: true },
    });
    const lotIds = grouped
      .map((row) => row.stockLotId)
      .filter((id): id is string => id !== null);
    const lots =
      lotIds.length > 0
        ? await this.prisma.warehouseStockLot.findMany({
            where: { id: { in: lotIds } },
            select: { id: true, productName: true },
          })
        : [];
    const lotNameById = new Map(lots.map((row) => [row.id, row.productName]));
    return grouped
      .map((row) => ({
        stockLotId: row.stockLotId,
        productName: row.stockLotId
          ? (lotNameById.get(row.stockLotId) ?? 'Nepoznat lot')
          : 'Bez lota',
        count: row._count._all,
      }))
      .sort((a, b) => a.productName.localeCompare(b.productName, 'bs'));
  }

  async findOne(user: AuthenticatedUser, id: string): Promise<EquipmentWithDisposalReason> {
    const equipment = await this.prisma.equipment.findUnique({
      where: { id },
      include: {
        currentHolder: true,
        category: { select: { id: true, name: true, parentId: true } },
        stockLot: { select: { id: true, productName: true } },
      },
    });
    if (!equipment) {
      throw new NotFoundException('Equipment not found');
    }
    await assertCanReadEquipment(
      user,
      equipment,
      equipment.currentHolder,
      this.registrarScope,
      this.prisma,
      this.moderatorScope,
    );
    const disposalReason = await resolveEquipmentDisposalReason(
      this.prisma,
      equipment.id,
      equipment.status,
      equipment.notes,
    );
    return { ...equipment, disposalReason };
  }

  async resolveCustodyPool(
    user: AuthenticatedUser,
    inventoryNumberInput: string,
  ): Promise<EquipmentWithDisposalReason & { lastRazduzenjeFromPerson?: Pick<Employee, 'id' | 'firstName' | 'lastName' | 'orgUnitId'> | null }> {
    await this.settingsService.assertFeatureEnabled('features.registrar_mode_b_custody_pool');
    await this.settingsService.assertFeatureEnabled('features.equipment');
    if (user.role !== 'evidenticar') {
      throw new ForbiddenException(CUSTODY_POOL_LOOKUP_NOT_FOUND_MESSAGE);
    }
    const inventoryNumber = normalizeInventoryNumber(inventoryNumberInput);
    if (!inventoryNumber) {
      throw new NotFoundException(CUSTODY_POOL_LOOKUP_NOT_FOUND_MESSAGE);
    }
    const equipment = await this.prisma.equipment.findUnique({
      where: { inventoryNumber },
      include: {
        currentHolder: true,
        category: { select: { id: true, name: true, parentId: true } },
        warehouse: { select: { id: true, name: true, cityId: true } },
        stockLot: { select: { id: true, productName: true } },
        custodyOrgUnit: { select: { id: true, name: true } },
      },
    });
    if (!equipment) {
      throw new NotFoundException(CUSTODY_POOL_LOOKUP_NOT_FOUND_MESSAGE);
    }
    const inPool = await this.registrarScope.isEquipmentInCustodyPool(user, equipment);
    if (!inPool) {
      throw new NotFoundException(CUSTODY_POOL_LOOKUP_NOT_FOUND_MESSAGE);
    }
    const lastRazduzenje = await this.prisma.transfer.findFirst({
      where: { equipmentId: equipment.id, type: 'razduzenje', status: 'potpisan' },
      orderBy: { createdAt: 'desc' },
      select: {
        fromPerson: { select: { id: true, firstName: true, lastName: true, orgUnitId: true } },
      },
    });
    const disposalReason = await resolveEquipmentDisposalReason(
      this.prisma,
      equipment.id,
      equipment.status,
      equipment.notes,
    );
    return {
      ...equipment,
      disposalReason,
      lastRazduzenjeFromPerson: lastRazduzenje?.fromPerson ?? null,
    };
  }

  async create(_user: AuthenticatedUser, _dto: CreateEquipmentDto): Promise<Equipment> {
    await this.settingsService.assertFeatureEnabled('features.equipment');
    throw new ForbiddenException(
      'Oprema se kreira izdavanjem iz skladišnog lota (prijem robe na skladištu, zatim issue)',
    );
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateEquipmentDto): Promise<Equipment> {
    await this.settingsService.assertFeatureEnabled('features.equipment');
    const existing = await this.prisma.equipment.findUnique({
      where: { id },
      include: { currentHolder: true },
    });
    if (!existing) {
      throw new NotFoundException('Equipment not found');
    }
    await assertCanReadEquipment(
      user,
      existing,
      existing.currentHolder,
      this.registrarScope,
      this.prisma,
      this.moderatorScope,
    );
    await assertCanWriteEquipment(
      user,
      existing,
      existing.currentHolder,
      this.registrarScope,
      this.prisma,
      this.moderatorScope,
    );
    const mutatesState =
      dto.status !== undefined ||
      dto.currentHolderId !== undefined ||
      dto.warehouseId !== undefined ||
      dto.warehouseCondition !== undefined;
    if (mutatesState) {
      await this.inventoryFreeze.assertNoEquipmentMutation(existing.id, user, 'equipment_update');
    }
    const categoryId = dto.categoryId ?? existing.categoryId;
    const category = await this.categoriesService.assertLeafCategory(categoryId);
    const { fields, optionalFields } = this.categoriesService.getFieldDefinitions(category);
    const existingSpecs = (existing.specifications ?? {}) as Record<string, string>;
    let specifications = (dto.specifications ?? existingSpecs) as Record<string, string>;
    if (user.role === 'evidenticar' && dto.specifications) {
      specifications = resolveRegistrarEquipmentSpecifications(
        existingSpecs,
        dto.specifications,
        fields,
        optionalFields,
      );
    }
    validateEquipmentSpecifications(specifications, fields, optionalFields);
    if (dto.currentHolderId) {
      const holder = await this.getEmployeeOrThrow(dto.currentHolderId);
      if (this.moderatorScope.isModerator(user)) {
        await this.moderatorScope.assertEmployeeInScope(user, dto.currentHolderId);
      } else {
        const draft = { ...existing, categoryId, currentHolderId: dto.currentHolderId };
        await this.registrarScope.assertCanAccessEquipment(user, draft, holder);
      }
    }
    const nextIsAccountingTracked = dto.isAccountingTracked ?? existing.isAccountingTracked;
    const nextInventoryNumber =
      dto.inventoryNumber !== undefined
        ? normalizeInventoryNumber(dto.inventoryNumber)
        : existing.inventoryNumber;
    assertEquipmentAccountingUpgrade({
      existing: {
        isAccountingTracked: existing.isAccountingTracked,
        inventoryNumber: existing.inventoryNumber,
      },
      next: {
        isAccountingTracked: nextIsAccountingTracked,
        inventoryNumber: nextInventoryNumber,
      },
    });
    try {
      return await this.prisma.equipment.update({
        where: { id },
        data: {
          categoryId: dto.categoryId,
          inventoryNumber: nextInventoryNumber,
          isAccountingTracked: nextIsAccountingTracked,
          affiliation: dto.affiliation,
          specifications,
          status: dto.status,
          contractNumber: dto.contractNumber,
          entryDate: dto.entryDate ? new Date(dto.entryDate) : undefined,
          currentHolderId: dto.currentHolderId,
          warehouseId: dto.warehouseId,
          warehouseCondition: dto.warehouseCondition,
          notes: dto.notes,
        },
      });
    } catch {
      throw new ConflictException('Inventory number already exists');
    }
  }

  async reactivate(user: AuthenticatedUser, id: string, reason: string): Promise<Equipment> {
    await this.settingsService.assertFeatureEnabled('features.equipment');
    const existing = await this.prisma.equipment.findUnique({
      where: { id },
      include: { currentHolder: true },
    });
    if (!existing) {
      throw new NotFoundException('Equipment not found');
    }
    if (user.role !== 'admin' && !this.moderatorScope.isModerator(user)) {
      throw new ForbiddenException('Only admin or moderator can reactivate equipment');
    }
    if (this.moderatorScope.isModerator(user)) {
      await this.moderatorScope.assertEquipmentInScope(user, existing, existing.currentHolder);
    }
    if (existing.status !== 'rashodovano' || existing.warehouseCondition !== 'unisteno') {
      throw new BadRequestException(
        'Reaktivacija je moguća samo za službeno rashodovanu i uništenu opremu',
      );
    }
    if (!existing.warehouseId) {
      throw new BadRequestException('Oprema nema skladište za povrat');
    }
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      throw new BadRequestException('Obrazloženje reaktivacije je obavezno');
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.equipment.update({
        where: { id },
        data: {
          status: 'skladiste',
          warehouseCondition: 'na_skladistu',
          currentHolderId: null,
          notes: existing.notes
            ? `${existing.notes}\n\n[Reaktivacija] ${trimmedReason}`
            : `[Reaktivacija] ${trimmedReason}`,
        },
      });
      await tx.equipmentEvent.create({
        data: {
          equipmentId: id,
          warehouseId: existing.warehouseId!,
          actorUserId: user.id,
          action: 'reaktivirano',
          fromCondition: 'unisteno',
          toCondition: 'na_skladistu',
        },
      });
      return updated;
    });
  }

  async remove(user: AuthenticatedUser, id: string): Promise<void> {
    await this.settingsService.assertFeatureEnabled('features.equipment');
    const existing = await this.prisma.equipment.findUnique({
      where: { id },
      include: { currentHolder: true },
    });
    if (!existing) {
      throw new NotFoundException('Equipment not found');
    }
    await assertCanReadEquipment(
      user,
      existing,
      existing.currentHolder,
      this.registrarScope,
      this.prisma,
      this.moderatorScope,
    );
    await assertCanWriteEquipment(
      user,
      existing,
      existing.currentHolder,
      this.registrarScope,
      this.prisma,
      this.moderatorScope,
    );
    if (user.role !== 'admin' && !this.moderatorScope.isModerator(user)) {
      throw new ForbiddenException('Only admin or moderator can delete equipment');
    }
    await this.prisma.equipment.delete({ where: { id } });
  }

  async checkInventoryNumberAvailable(value: string): Promise<{ available: boolean }> {
    await this.settingsService.assertFeatureEnabled('features.equipment');
    const trimmed = value.trim();
    if (!trimmed) {
      return { available: false };
    }
    const existing = await this.prisma.equipment.findUnique({
      where: { inventoryNumber: trimmed },
      select: { id: true },
    });
    return { available: !existing };
  }

  async checkUniqueSpecificationValue(
    categoryId: string,
    fieldId: string,
    value: string,
  ): Promise<{ available: boolean }> {
    await this.settingsService.assertFeatureEnabled('features.equipment');
    const trimmed = value.trim();
    if (!trimmed) {
      return { available: false };
    }
    const category = await this.categoriesService.assertLeafCategory(categoryId);
    const { fields } = this.categoriesService.getFieldDefinitions(category);
    const field = fields.find((row) => row.id === fieldId && row.unique);
    if (!field) {
      throw new BadRequestException('Invalid unique specification field');
    }
    const existing = await this.prisma.equipment.findFirst({
      where: {
        categoryId,
        specifications: buildSpecificationFieldFilter(fieldId, trimmed),
      },
      select: { id: true },
    });
    return { available: !existing };
  }

  async getQrPayload(user: AuthenticatedUser, id: string): Promise<{
    id: string;
    inventoryNumber: string | null;
    url: string;
  }> {
    const equipment = await this.findOne(user, id);
    const appUrl = this.configService.get<string>('APP_URL', 'http://localhost:8080');
    return {
      id: equipment.id,
      inventoryNumber: equipment.inventoryNumber,
      url: `${appUrl.replace(/\/$/, '')}/equipment/${equipment.id}`,
    };
  }

  private async buildListWhere(
    user: AuthenticatedUser,
    query: ListEquipmentQueryDto,
  ): Promise<Prisma.EquipmentWhereInput> {
    const stockLotFilter: Prisma.EquipmentWhereInput =
      query.stockLotId === 'none'
        ? { stockLotId: null }
        : query.stockLotId
          ? { stockLotId: query.stockLotId }
          : {};
    let categoryTextFieldIds: string[] | undefined;
    const trimmedSearch = query.search?.trim();
    let specMatchEquipmentIds: string[] | undefined;
    let holderMatchEmployeeIds: string[] | undefined;
    if (trimmedSearch) {
      const employeeScope = user.role === 'moderator'
        ? ((await this.moderatorScope.buildScopedEmployeeWhere(user)) ?? {})
        : await this.registrarScope.buildEmployeeWhere(user);
      [specMatchEquipmentIds, holderMatchEmployeeIds] = await Promise.all([
        findEquipmentIdsBySpecificationSearch(this.prisma, trimmedSearch, query.categoryId),
        findEmployeeIdsByHolderSearch(this.prisma, trimmedSearch, employeeScope),
      ]);
    }
    if (query.categoryId && trimmedSearch) {
      const category = await this.prisma.category.findUnique({ where: { id: query.categoryId } });
      if (category) {
        const { fields, optionalFields } = this.categoriesService.getFieldDefinitions(category);
        categoryTextFieldIds = collectCategoryTextFieldIds([...fields, ...optionalFields]);
      }
    }
    const searchWhere = buildEquipmentSearchWhere({
      search: query.search,
      specFieldId: query.specFieldId,
      specValue: query.specValue,
      categoryTextFieldIds,
      specMatchEquipmentIds,
      holderMatchEmployeeIds,
    });
    const filters: Prisma.EquipmentWhereInput = {
      status: query.status,
      affiliation: query.affiliation,
      isAccountingTracked: query.isAccountingTracked,
      categoryId: query.categoryId,
      currentHolderId: query.currentHolderId,
      ...stockLotFilter,
      ...(searchWhere ?? {}),
    };
    if (isOwnHeldEquipmentListQuery(user, query.currentHolderId)) {
      return filters;
    }
    const scopeWhere = await this.buildEquipmentScopeWhere(user);
    const parts = [scopeWhere, filters].filter((part) => Object.keys(part).length > 0);
    if (parts.length === 0) {
      return {};
    }
    if (parts.length === 1) {
      return parts[0]!;
    }
    return { AND: parts };
  }

  private async buildOperationalEquipmentScopeWhere(user: AuthenticatedUser): Promise<Prisma.EquipmentWhereInput> {
    if (this.moderatorScope.isModerator(user)) {
      return ((await this.moderatorScope.buildOperationalEquipmentScopeWhere(user)) ??
        {}) as Prisma.EquipmentWhereInput;
    }
    return this.registrarScope.buildEquipmentWhere(user);
  }

  private async buildEquipmentScopeWhere(user: AuthenticatedUser): Promise<Prisma.EquipmentWhereInput> {
    if (this.moderatorScope.isModerator(user)) {
      return ((await this.moderatorScope.buildEquipmentScopeWhere(user)) ?? {}) as Prisma.EquipmentWhereInput;
    }
    return this.registrarScope.buildEquipmentWhere(user);
  }

  async exportCsv(user: AuthenticatedUser, query: ListEquipmentQueryDto): Promise<string> {
    await this.settingsService.assertFeatureEnabled('features.equipment');
    const where = await this.buildListWhere(user, query);
    const rows = await this.prisma.equipment.findMany({
      where,
      include: {
        currentHolder: { select: { firstName: true, lastName: true } },
        category: { select: { name: true } },
        stockLot: { select: { productName: true } },
      },
      orderBy: { inventoryNumber: 'asc' },
    });
    const headers = [
      'Inv. broj',
      'Kategorija',
      'Naziv lota',
      'Status',
      'Zadužen na',
      'Ugovor',
      'Datum unosa',
      'Bilješke',
    ];
    const lines: string[] = [headers.map(escapeCsvCell).join(',')];
    for (const row of rows) {
      const holder = row.currentHolder
        ? `${row.currentHolder.firstName} ${row.currentHolder.lastName}`.trim()
        : '';
      lines.push(
        [
          row.inventoryNumber,
          row.category?.name ?? '',
          row.stockLot?.productName ?? '',
          row.status,
          holder,
          row.contractNumber ?? '',
          row.entryDate ? row.entryDate.toISOString().slice(0, 10) : '',
          row.notes ?? '',
        ]
          .map(escapeCsvCell)
          .join(','),
      );
    }
    return lines.join('\r\n');
  }

  private async getEmployeeOrThrow(id: string) {
    const employee = await this.prisma.employee.findUnique({ where: { id } });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }
    return employee;
  }
}
