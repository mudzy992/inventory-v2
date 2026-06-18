import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  EmployeeRelocationEventAction,
  Prisma,
} from '../../../generated/prisma/client';
import { InventoryFreezeService } from '../../common/services/inventory-freeze.service';
import { LocationResolutionService } from '../../common/services/location-resolution.service';
import { RegistrarScopeService } from '../../common/services/registrar-scope.service';
import { WarehouseResolutionService } from '../../common/services/warehouse-resolution.service';
import { getEquipmentInventoryLabel } from '../../common/utils/equipment-accounting-tracked.util';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { isRegistrarModeA } from '../../common/types/registrar-scope.type';
import {
  buildOrderBy,
  paginate,
  parsePagination,
  resolveListPageSize,
} from '../../common/utils/pagination.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CategoriesService } from '../categories/categories.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';
import { ListRelocationQueryDto } from './dto/list-relocation-query.dto';
import { PreviewRelocationQueryDto } from './dto/preview-relocation-query.dto';
import { MapCatalogDto } from './dto/map-catalog.dto';
import {
  getEffectiveCatalogItemId,
  isLineMissingCatalog,
} from './utils/effective-catalog.util';
import { applyDestAcceptLotUpdatesInTx } from './utils/relocation-lot-accounting.util';
import {
  inheritDestLotSpecificationsInTx,
} from './utils/inherit-dest-lot-specifications.util';
import { resolveCanonicalDestLotInTx } from '../warehouse-stock/utils/resolve-canonical-dest-lot.util';

const RELOCATION_LINE_SORT_FIELDS: Record<string, string> = {
  createdAt: 'createdAt',
  status: 'status',
};

const RELOCATION_CASE_SORT_FIELDS: Record<string, string> = {
  createdAt: 'createdAt',
};
import {
  findAdminUserIds,
  findRegistrarUserIds,
  isWarehouseCategoryTreeCovered,
} from './utils/find-registrar-user-ids.util';

const lineInclude = {
  equipment: {
    select: {
      id: true,
      inventoryNumber: true,
      status: true,
      catalogItemId: true,
      stockLotId: true,
      stockLot: { select: { catalogItemId: true, productName: true, specifications: true, status: true } },
      catalogItem: { select: { id: true, code: true, name: true } },
    },
  },
  case: {
    include: {
      employee: { select: { id: true, firstName: true, lastName: true, orgUnitId: true } },
    },
  },
} satisfies Prisma.EmployeeRelocationLineInclude;

@Injectable()
export class EmployeeRelocationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly warehouseResolution: WarehouseResolutionService,
    private readonly registrarScope: RegistrarScopeService,
    private readonly locationResolution: LocationResolutionService,
    private readonly inventoryFreeze: InventoryFreezeService,
    private readonly notifications: NotificationsService,
    private readonly settingsService: SettingsService,
    private readonly categoriesService: CategoriesService,
  ) {}

  async preview(query: PreviewRelocationQueryDto) {
    await this.settingsService.assertFeatureEnabled('features.employee_relocation');
    const employee = await this.prisma.employee.findUnique({ where: { id: query.employeeId } });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }
    const fromWarehouseId = await this.warehouseResolution.resolveForOrgUnit(employee.orgUnitId);
    const toWarehouseId = await this.warehouseResolution.resolveForOrgUnit(query.newOrgUnitId);
    const sameWarehouse = fromWarehouseId === toWarehouseId && fromWarehouseId !== null;
    const held = await this.prisma.equipment.findMany({
      where: { currentHolderId: employee.id, status: 'zaduzeno' },
      include: {
        category: { select: { id: true, name: true } },
        stockLot: { select: { catalogItemId: true } },
      },
    });
    const byCategory = new Map<string, { categoryId: string; categoryName: string; count: number }>();
    for (const row of held) {
      const existing = byCategory.get(row.categoryId);
      if (existing) {
        existing.count += 1;
      } else {
        byCategory.set(row.categoryId, {
          categoryId: row.categoryId,
          categoryName: row.category.name,
          count: 1,
        });
      }
    }
    const warnings: string[] = [];
    if (!sameWarehouse && held.length > 0) {
      if (!fromWarehouseId) {
        warnings.push('Izvorno skladište nije definisano u hijerarhiji.');
      }
      if (!toWarehouseId) {
        warnings.push('Ciljno skladište nije definisano u hijerarhiji.');
      }
      for (const group of byCategory.values()) {
        if (fromWarehouseId) {
          const sourceRegs = await findRegistrarUserIds(
            this.prisma,
            this.registrarScope,
            fromWarehouseId,
            group.categoryId,
          );
          if (sourceRegs.length === 0) {
            warnings.push(`Nema evidentičara za „${group.categoryName}" na izvornom skladištu.`);
          }
        }
        if (toWarehouseId) {
          const destRegs = await findRegistrarUserIds(
            this.prisma,
            this.registrarScope,
            toWarehouseId,
            group.categoryId,
          );
          if (destRegs.length === 0) {
            warnings.push(`Nema evidentičara za „${group.categoryName}" na ciljnom skladištu.`);
          }
        }
      }
    }
    const unmappedEquipment = held
      .filter((row) => isLineMissingCatalog(row))
      .map((row) => ({
        equipmentId: row.id,
        inventoryNumber: row.inventoryNumber,
        categoryId: row.categoryId,
        categoryName: row.category.name,
      }));
    if (!sameWarehouse && unmappedEquipment.length > 0) {
      warnings.push(
        `${unmappedEquipment.length} stavki nema mapiran tip u šifrarniku — transfer neće biti moguć dok admin ne mapira.`,
      );
    }
    return {
      employeeId: employee.id,
      fromOrgUnitId: employee.orgUnitId,
      toOrgUnitId: query.newOrgUnitId,
      fromWarehouseId,
      toWarehouseId,
      sameWarehouse,
      assignedCount: held.length,
      byCategory: [...byCategory.values()],
      unmappedEquipment,
      warnings,
      requiresAction: !sameWarehouse && held.length > 0,
    };
  }

  async handleOrgUnitChange(
    employeeId: string,
    previousOrgUnitId: string,
    newOrgUnitId: string,
    actorUserId: string,
  ): Promise<void> {
    if (!(await this.settingsService.getBooleanValue('features.employee_relocation', true))) {
      return;
    }
    if (previousOrgUnitId === newOrgUnitId) {
      return;
    }
    const fromWarehouseId = await this.warehouseResolution.resolveForOrgUnit(previousOrgUnitId);
    const toWarehouseId = await this.warehouseResolution.resolveForOrgUnit(newOrgUnitId);
    if (fromWarehouseId === toWarehouseId) {
      return;
    }
    await this.supersedeOpenCases(employeeId, actorUserId);
    const held = await this.prisma.equipment.findMany({
      where: { currentHolderId: employeeId, status: 'zaduzeno' },
      select: { id: true, categoryId: true },
    });
    if (held.length === 0) {
      return;
    }
    if (!fromWarehouseId || !toWarehouseId) {
      const admins = await findAdminUserIds(this.prisma);
      await this.notifications.notifyEmployeeRelocationAdminAlert({
        userIds: admins,
        title: 'Promjena org. jedinice — nedostaje skladište',
        message: 'Radnik ima zaduženu opremu, ali efektivno skladište nije definisano.',
        relatedId: employeeId,
      });
      return;
    }
    const employee = await this.prisma.employee.findUniqueOrThrow({ where: { id: employeeId } });
    const caseRow = await this.prisma.employeeRelocationCase.create({
      data: {
        employeeId,
        fromOrgUnitId: previousOrgUnitId,
        toOrgUnitId: newOrgUnitId,
        fromWarehouseId,
        toWarehouseId,
        createdByUserId: actorUserId,
        lines: {
          create: held.map((row) => ({
            equipmentId: row.id,
            categoryId: row.categoryId,
          })),
        },
        events: {
          create: {
            actorUserId,
            action: 'case_opened',
            payload: { fromWarehouseId, toWarehouseId, lineCount: held.length },
          },
        },
      },
      include: { lines: true },
    });
    const notifiedSource = new Set<string>();
    for (const line of caseRow.lines) {
      const sourceRegs = await findRegistrarUserIds(
        this.prisma,
        this.registrarScope,
        fromWarehouseId,
        line.categoryId,
      );
      if (sourceRegs.length === 0) {
        const admins = await findAdminUserIds(this.prisma);
        await this.notifications.notifyEmployeeRelocationAdminAlert({
          userIds: admins,
          title: 'Nema evidentičara na izvoru',
          message: `${employee.firstName} ${employee.lastName} — potrebna akcija za opremu bez evidentičara na izvornom skladištu.`,
          relatedId: line.id,
        });
        continue;
      }
      for (const userId of sourceRegs) {
        if (notifiedSource.has(userId)) {
          continue;
        }
        notifiedSource.add(userId);
        await this.notifications.notifyEmployeeRelocationActionRequired({
          userId,
          employeeName: `${employee.firstName} ${employee.lastName}`,
          caseId: caseRow.id,
        });
      }
    }
    const admins = await findAdminUserIds(this.prisma);
    await this.notifications.notifyEmployeeRelocationAdminAlert({
      userIds: admins,
      title: 'Promjena org. jedinice radnika',
      message: `${employee.firstName} ${employee.lastName} prebačen — ${held.length} zaduženih komada zahtijeva akciju.`,
      relatedId: caseRow.id,
    });
  }

  async listForUser(user: AuthenticatedUser, query: ListRelocationQueryDto) {
    await this.settingsService.assertFeatureEnabled('features.employee_relocation');
    if (user.role !== 'admin' && user.role !== 'evidenticar') {
      throw new ForbiddenException('Only registrar or admin can list relocation cases');
    }
    const { pageSize, maxPageSize } = await resolveListPageSize(query.pageSize, this.settingsService);
    const { page, take } = parsePagination(query, { defaultPageSize: pageSize, maxPageSize });
    const lineOrderBy = buildOrderBy(
      query.sortBy,
      query.sortDir,
      RELOCATION_LINE_SORT_FIELDS,
      'createdAt',
    );
    const caseOrderBy = buildOrderBy(
      query.sortBy,
      query.sortDir,
      RELOCATION_CASE_SORT_FIELDS,
      'createdAt',
    );
    const sourceWhere = await this.buildSourceLinesWhere(user);
    const destWhere = await this.buildDestLinesWhere(user);
    const [sourceLines, destLines, openCases] = await Promise.all([
      paginate({
        findMany: (args) =>
          this.prisma.employeeRelocationLine.findMany({ ...args, include: lineInclude }),
        count: (args) => this.prisma.employeeRelocationLine.count(args),
        where: sourceWhere,
        orderBy: lineOrderBy,
        page,
        pageSize: take,
      }),
      paginate({
        findMany: (args) =>
          this.prisma.employeeRelocationLine.findMany({ ...args, include: lineInclude }),
        count: (args) => this.prisma.employeeRelocationLine.count(args),
        where: destWhere,
        orderBy: lineOrderBy,
        page,
        pageSize: take,
      }),
      user.role === 'admin'
        ? paginate({
            findMany: (args) =>
              this.prisma.employeeRelocationCase.findMany({
                ...args,
                include: {
                  employee: { select: { id: true, firstName: true, lastName: true } },
                  lines: { include: lineInclude },
                },
              }),
            count: (args) => this.prisma.employeeRelocationCase.count(args),
            where: { status: 'open' as const },
            orderBy: caseOrderBy,
            page,
            pageSize: take,
          })
        : Promise.resolve({
            items: [],
            meta: { page, pageSize: take, total: 0, totalPages: 0 },
          }),
    ]);
    return { sourceLines, destLines, openCases };
  }

  private async buildSourceLinesWhere(
    user: AuthenticatedUser,
  ): Promise<Prisma.EmployeeRelocationLineWhereInput> {
    const base: Prisma.EmployeeRelocationLineWhereInput = {
      status: { in: ['pending_source', 'rejected'] },
      case: { status: 'open' },
    };
    if (user.role === 'admin') {
      return base;
    }
    const scopeClauses = await this.buildRegistrarLineScopeClauses(user, 'source');
    if (scopeClauses.length === 0) {
      return { id: { in: [] } };
    }
    return { AND: [base, { OR: scopeClauses }] };
  }

  private async buildDestLinesWhere(
    user: AuthenticatedUser,
  ): Promise<Prisma.EmployeeRelocationLineWhereInput> {
    const base: Prisma.EmployeeRelocationLineWhereInput = {
      status: 'pending_dest',
      case: { status: 'open' },
    };
    if (user.role === 'admin') {
      return base;
    }
    const scopeClauses = await this.buildRegistrarLineScopeClauses(user, 'dest');
    if (scopeClauses.length === 0) {
      return { id: { in: [] } };
    }
    return { AND: [base, { OR: scopeClauses }] };
  }

  private async buildRegistrarLineScopeClauses(
    user: AuthenticatedUser,
    side: 'source' | 'dest',
  ): Promise<Prisma.EmployeeRelocationLineWhereInput[]> {
    const clauses: Prisma.EmployeeRelocationLineWhereInput[] = [];
    for (const assignment of user.registrarScopes) {
      if (!isRegistrarModeA(assignment)) {
        continue;
      }
      const categoryIds = [...(await this.registrarScope.expandCategoryIds([assignment.categoryId]))];
      clauses.push({
        categoryId: { in: categoryIds },
        case:
          side === 'source'
            ? { fromWarehouseId: assignment.warehouseId }
            : { toWarehouseId: assignment.warehouseId },
      });
    }
    return clauses;
  }

  async listEventsForEquipment(equipmentId: string) {
    await this.settingsService.assertFeatureEnabled('features.employee_relocation');
    const lines = await this.prisma.employeeRelocationLine.findMany({
      where: { equipmentId },
      select: { caseId: true },
    });
    const caseIds = [...new Set(lines.map((row) => row.caseId))];
    if (caseIds.length === 0) {
      return [];
    }
    return this.prisma.employeeRelocationEvent.findMany({
      where: { caseId: { in: caseIds } },
      include: {
        actor: { select: { id: true, username: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getCase(user: AuthenticatedUser, caseId: string) {
    await this.settingsService.assertFeatureEnabled('features.employee_relocation');
    const caseRow = await this.prisma.employeeRelocationCase.findUnique({
      where: { id: caseId },
      include: {
        employee: true,
        lines: { include: lineInclude },
        events: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
    });
    if (!caseRow) {
      throw new NotFoundException('Case not found');
    }
    return caseRow;
  }

  async resolveSource(user: AuthenticatedUser, lineId: string, action: 'transfer' | 'discharge') {
    await this.settingsService.assertFeatureEnabled('features.employee_relocation');
    const line = await this.getLineOrThrow(lineId);
    if (line.status !== 'pending_source' && line.status !== 'rejected') {
      throw new BadRequestException('Stavka ne čeka akciju izvornog evidentičara');
    }
    await this.assertSourceRegistrar(user, line);
    await this.inventoryFreeze.assertNoEquipmentMutation(line.equipmentId, user, 'equipment_update');
    if (action === 'discharge') {
      return this.executeDischarge(user, line);
    }
    return this.executeSourceTransfer(user, line);
  }

  async resolveDest(user: AuthenticatedUser, lineId: string, action: 'accept' | 'reject') {
    await this.settingsService.assertFeatureEnabled('features.employee_relocation');
    const line = await this.getLineOrThrow(lineId);
    if (line.status !== 'pending_dest') {
      throw new BadRequestException('Stavka ne čeka odluku ciljnog evidentičara');
    }
    await this.assertDestRegistrar(user, line);
    await this.inventoryFreeze.assertNoEquipmentMutation(line.equipmentId, user, 'equipment_update');
    if (action === 'reject') {
      return this.executeDestReject(user, line);
    }
    return this.executeDestAccept(user, line);
  }

  async mapLineCatalog(user: AuthenticatedUser, lineId: string, dto: MapCatalogDto) {
    await this.settingsService.assertFeatureEnabled('features.employee_relocation');
    if (user.role !== 'admin') {
      throw new ForbiddenException('Samo administrator može mapirati šifrarnik');
    }
    const line = await this.getLineOrThrow(lineId);
    if (!['pending_source', 'rejected'].includes(line.status)) {
      throw new BadRequestException('Šifrarnik se može mapirati samo za aktivne stavke na izvoru');
    }
    if (line.case.status !== 'open') {
      throw new BadRequestException('Case nije aktivan');
    }
    const catalogItem = await this.prisma.equipmentCatalogItem.findUnique({
      where: { id: dto.catalogItemId },
    });
    if (!catalogItem || !catalogItem.isActive) {
      throw new NotFoundException('Stavka šifrarnika nije pronađena');
    }
    if (catalogItem.categoryId !== line.categoryId) {
      throw new BadRequestException('Stavka šifrarnika mora biti iz iste kategorije kao oprema');
    }
    await this.categoriesService.assertLeafCategory(catalogItem.categoryId);
    await this.prisma.$transaction(async (tx) => {
      await tx.equipment.update({
        where: { id: line.equipmentId },
        data: { catalogItemId: dto.catalogItemId },
      });
      await this.recordEvent(tx, line.caseId, line.id, user.id, 'catalog_mapped', {
        equipmentId: line.equipmentId,
        catalogItemId: dto.catalogItemId,
      });
    });
    return this.getLineOrThrow(lineId);
  }

  async getAdminAlerts() {
    await this.settingsService.assertFeatureEnabled('features.employee_relocation');
    const warehouses = await this.prisma.warehouse.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    });
    const parentCategories = await this.prisma.category.findMany({
      where: { categoryKind: 'ASSET', parentId: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    const missingRegistrars: Array<{
      warehouseId: string;
      warehouseName: string;
      categoryId: string;
      categoryName: string;
    }> = [];
    for (const warehouse of warehouses) {
      for (const category of parentCategories) {
        const covered = await isWarehouseCategoryTreeCovered(
          this.prisma,
          this.registrarScope,
          warehouse.id,
          category.id,
        );
        if (!covered) {
          missingRegistrars.push({
            warehouseId: warehouse.id,
            warehouseName: warehouse.name,
            categoryId: category.id,
            categoryName: category.name,
          });
        }
      }
    }
    const openCases = await this.prisma.employeeRelocationCase.count({ where: { status: 'open' } });
    const pendingDest = await this.prisma.employeeRelocationLine.count({
      where: { status: 'pending_dest' },
    });
    const activeSourceLines = await this.prisma.employeeRelocationLine.findMany({
      where: {
        status: { in: ['pending_source', 'rejected'] },
        case: { status: 'open' },
      },
      select: {
        equipment: {
          select: {
            catalogItemId: true,
            stockLot: { select: { catalogItemId: true } },
          },
        },
      },
    });
    const unmappedCatalogLines = activeSourceLines.filter((row) =>
      isLineMissingCatalog(row.equipment),
    ).length;
    return { missingRegistrars, openCases, pendingDest, unmappedCatalogLines };
  }

  private async executeDischarge(
    user: AuthenticatedUser,
    line: Prisma.EmployeeRelocationLineGetPayload<{ include: typeof lineInclude }>,
  ) {
    const caseRow = line.case;
    await this.prisma.$transaction(async (tx) => {
      await tx.equipment.update({
        where: { id: line.equipmentId },
        data: {
          status: 'skladiste',
          currentHolderId: null,
          warehouseId: caseRow.fromWarehouseId,
          warehouseCondition: 'na_skladistu',
        },
      });
      await tx.employeeRelocationLine.update({
        where: { id: line.id },
        data: {
          status: 'discharged',
          sourceAction: 'discharge',
          sourceResolvedByUserId: user.id,
          resolvedAt: new Date(),
        },
      });
      await this.recordEvent(tx, caseRow.id, line.id, user.id, 'source_discharge', {
        equipmentId: line.equipmentId,
      });
      await this.tryResolveCase(tx, caseRow.id);
    });
    return this.getLineOrThrow(line.id);
  }

  private async executeSourceTransfer(
    user: AuthenticatedUser,
    line: Prisma.EmployeeRelocationLineGetPayload<{ include: typeof lineInclude }>,
  ) {
    const caseRow = line.case;
    const equipment = line.equipment;
    const catalogItemId = getEffectiveCatalogItemId(equipment);
    if (!catalogItemId) {
      const admins = await findAdminUserIds(this.prisma);
      await this.notifications.notifyEmployeeRelocationAdminAlert({
        userIds: admins,
        title: 'Oprema bez šifrarnika',
        message: `Inventurni broj ${equipment.inventoryNumber} nema mapiranu stavku šifrarnika — transfer nije moguć.`,
        relatedId: line.id,
      });
      throw new BadRequestException(
        'Oprema nema stavku šifrarnika. Administrator mora mapirati tip prije transfera.',
      );
    }
    const catalogItem = await this.prisma.equipmentCatalogItem.findUnique({
      where: { id: catalogItemId },
    });
    if (!catalogItem) {
      throw new BadRequestException('Stavka šifrarnika nije pronađena');
    }
    const destRegs = await findRegistrarUserIds(
      this.prisma,
      this.registrarScope,
      caseRow.toWarehouseId,
      line.categoryId,
    );
    if (destRegs.length === 0) {
      const admins = await findAdminUserIds(this.prisma);
      await this.notifications.notifyEmployeeRelocationAdminAlert({
        userIds: admins,
        title: 'Nema evidentičara na cilju',
        message: `Transfer opreme ${equipment.inventoryNumber} čeka dodjelu evidentičara na ciljnom skladištu.`,
        relatedId: line.id,
      });
    }
    const category = await this.categoriesService.assertLeafCategory(line.categoryId);
    const { fields, optionalFields } = this.categoriesService.getFieldDefinitions(category);
    await this.prisma.$transaction(async (tx) => {
      const { lot } = await resolveCanonicalDestLotInTx(tx, {
        destWarehouseId: caseRow.toWarehouseId,
        categoryId: line.categoryId,
        catalogItemId,
        catalogItemName: catalogItem.name,
        actorUserId: user.id,
      });
      const specResult = await inheritDestLotSpecificationsInTx(tx, {
        destLotId: lot.id,
        sourceStockLotId: equipment.stockLotId,
        destWarehouseId: caseRow.toWarehouseId,
        catalogItemId,
        categoryId: line.categoryId,
        fields,
        optionalFields,
        actorUserId: user.id,
      });
      await tx.employeeRelocationLine.update({
        where: { id: line.id },
        data: {
          status: 'pending_dest',
          sourceAction: 'transfer',
          sourceResolvedByUserId: user.id,
          destStockLotId: lot.id,
        },
      });
      await this.recordEvent(tx, caseRow.id, line.id, user.id, 'source_transfer', {
        destStockLotId: lot.id,
        catalogItemId,
        specsInherited: specResult.inherited,
        specsInheritanceSource: specResult.source,
      });
      return lot;
    });
    const employee = caseRow.employee;
    for (const userId of destRegs) {
      await this.notifications.notifyEmployeeRelocationIncoming({
        userId,
        employeeName: `${employee.firstName} ${employee.lastName}`,
        inventoryNumber: getEquipmentInventoryLabel(equipment),
        lineId: line.id,
      });
    }
    return this.getLineOrThrow(line.id);
  }

  private async executeDestReject(
    user: AuthenticatedUser,
    line: Prisma.EmployeeRelocationLineGetPayload<{ include: typeof lineInclude }>,
  ) {
    const caseRow = line.case;
    await this.prisma.$transaction(async (tx) => {
      await tx.employeeRelocationLine.update({
        where: { id: line.id },
        data: {
          status: 'rejected',
          destResolvedByUserId: user.id,
          resolvedAt: new Date(),
        },
      });
      await this.recordEvent(tx, caseRow.id, line.id, user.id, 'dest_rejected', {});
    });
    const sourceRegs = await findRegistrarUserIds(
      this.prisma,
      this.registrarScope,
      caseRow.fromWarehouseId,
      line.categoryId,
    );
    for (const userId of sourceRegs) {
      await this.notifications.notifyEmployeeRelocationActionRequired({
        userId,
        employeeName: `${caseRow.employee.firstName} ${caseRow.employee.lastName}`,
        caseId: caseRow.id,
        messageSuffix: ' (odbijeno na cilju)',
      });
    }
    return this.getLineOrThrow(line.id);
  }

  private async executeDestAccept(
    user: AuthenticatedUser,
    line: Prisma.EmployeeRelocationLineGetPayload<{ include: typeof lineInclude }>,
  ) {
    const caseRow = line.case;
    if (!line.destStockLotId) {
      throw new BadRequestException('Destinacijski lot nije definisan');
    }
    const category = await this.categoriesService.assertLeafCategory(line.categoryId);
    const { fields, optionalFields } = this.categoriesService.getFieldDefinitions(category);
    await this.prisma.$transaction(async (tx) => {
      const lotUpdate = await applyDestAcceptLotUpdatesInTx(tx, {
        equipment: {
          status: line.equipment.status,
          stockLotId: line.equipment.stockLotId,
        },
        fromWarehouseId: caseRow.fromWarehouseId,
        destStockLotId: line.destStockLotId!,
      });
      const specResult = await inheritDestLotSpecificationsInTx(tx, {
        destLotId: lotUpdate.destStockLotId,
        sourceStockLotId: lotUpdate.sourceStockLotId,
        destWarehouseId: caseRow.toWarehouseId,
        catalogItemId: lotUpdate.catalogItemId,
        categoryId: line.categoryId,
        fields,
        optionalFields,
        actorUserId: user.id,
      });
      await tx.equipment.update({
        where: { id: line.equipmentId },
        data: {
          stockLotId: lotUpdate.destStockLotId,
          catalogItemId: lotUpdate.catalogItemId,
        },
      });
      await tx.employeeRelocationLine.update({
        where: { id: line.id },
        data: {
          status: 'accepted',
          destResolvedByUserId: user.id,
          resolvedAt: new Date(),
        },
      });
      await this.recordEvent(tx, caseRow.id, line.id, user.id, 'dest_accepted', {
        destStockLotId: lotUpdate.destStockLotId,
        sourceStockLotId: lotUpdate.sourceStockLotId,
        quantityReceivedDelta: lotUpdate.deltas.sourceReceivedDelta,
        specsInherited: specResult.inherited,
        specsInheritanceSource: specResult.source,
      });
      await this.tryResolveCase(tx, caseRow.id);
    });
    return this.getLineOrThrow(line.id);
  }

  private async supersedeOpenCases(employeeId: string, actorUserId: string) {
    const openCases = await this.prisma.employeeRelocationCase.findMany({
      where: { employeeId, status: 'open' },
    });
    for (const caseRow of openCases) {
      await this.prisma.$transaction(async (tx) => {
        await tx.employeeRelocationCase.update({
          where: { id: caseRow.id },
          data: { status: 'cancelled', resolvedAt: new Date() },
        });
        await this.recordEvent(tx, caseRow.id, null, actorUserId, 'superseded', {});
      });
    }
  }

  private async tryResolveCase(tx: Prisma.TransactionClient, caseId: string) {
    const pending = await tx.employeeRelocationLine.count({
      where: {
        caseId,
        status: { in: ['pending_source', 'pending_dest', 'rejected'] },
      },
    });
    if (pending === 0) {
      await tx.employeeRelocationCase.update({
        where: { id: caseId },
        data: { status: 'resolved', resolvedAt: new Date() },
      });
      await this.recordEvent(tx, caseId, null, 'system', 'case_resolved', {});
    }
  }

  private async recordEvent(
    tx: Prisma.TransactionClient,
    caseId: string,
    lineId: string | null,
    actorUserId: string,
    action: EmployeeRelocationEventAction,
    payload: Prisma.InputJsonValue,
  ) {
    if (actorUserId === 'system') {
      const admin = await tx.user.findFirst({
        where: { role: 'admin', isActive: true },
        select: { id: true },
      });
      if (!admin) {
        return;
      }
      actorUserId = admin.id;
    }
    await tx.employeeRelocationEvent.create({
      data: { caseId, lineId, actorUserId, action, payload },
    });
  }

  private async getLineOrThrow(lineId: string) {
    const line = await this.prisma.employeeRelocationLine.findUnique({
      where: { id: lineId },
      include: lineInclude,
    });
    if (!line) {
      throw new NotFoundException('Relocation line not found');
    }
    return line;
  }

  private async assertSourceRegistrar(
    user: AuthenticatedUser,
    line: Prisma.EmployeeRelocationLineGetPayload<{ include: typeof lineInclude }>,
  ) {
    if (user.role === 'admin') {
      return;
    }
    const allowed = await this.canActAsSourceRegistrar(user, line);
    if (!allowed) {
      throw new ForbiddenException('Niste evidentičar za ovu kategoriju na izvornom skladištu');
    }
  }

  private async assertDestRegistrar(
    user: AuthenticatedUser,
    line: Prisma.EmployeeRelocationLineGetPayload<{ include: typeof lineInclude }>,
  ) {
    if (user.role === 'admin') {
      return;
    }
    const allowed = await this.canActAsDestRegistrar(user, line);
    if (!allowed) {
      throw new ForbiddenException('Niste evidentičar za ovu kategoriju na ciljnom skladištu');
    }
  }

  private async canActAsSourceRegistrar(
    user: AuthenticatedUser,
    line: Prisma.EmployeeRelocationLineGetPayload<{ include: typeof lineInclude }>,
  ) {
    if (user.role === 'admin') {
      return true;
    }
    const regs = await findRegistrarUserIds(
      this.prisma,
      this.registrarScope,
      line.case.fromWarehouseId,
      line.categoryId,
    );
    return regs.includes(user.id);
  }

  private async canActAsDestRegistrar(
    user: AuthenticatedUser,
    line: Prisma.EmployeeRelocationLineGetPayload<{ include: typeof lineInclude }>,
  ) {
    if (user.role === 'admin') {
      return true;
    }
    const regs = await findRegistrarUserIds(
      this.prisma,
      this.registrarScope,
      line.case.toWarehouseId,
      line.categoryId,
    );
    return regs.includes(user.id);
  }
}
