import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  InventoryLineStatus,
  InventoryRelocationTarget,
  InventoryWarehouseLineStatus,
  Prisma,
} from '../../../generated/prisma/client';
import type { PaginatedResponse } from '../../common/types/paginated-response.type';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import {
  buildContainsSearchWhere,
  buildOrderBy,
  paginate,
  parsePagination,
  resolveListPageSize,
} from '../../common/utils/pagination.util';
import { LocationResolutionService } from '../../common/services/location-resolution.service';
import { InventoryCoordinatorScopeService } from '../../common/services/inventory-coordinator-scope.service';
import { InventoryProductionModeService } from '../../common/services/inventory-production-mode.service';
import { OrgScopeService } from '../../common/services/org-scope.service';
import { RegistrarScopeService } from '../../common/services/registrar-scope.service';
import { WarehouseResolutionService } from '../../common/services/warehouse-resolution.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';
import { buildDisposalReportPayload } from './utils/build-disposal-report.util';
import { assertTransferCreationAllowed } from '../transfers/utils/transfer-generation-policy.util';
import { resolveDocumentWarehouseId } from '../transfers/utils/resolve-document-warehouse.util';
import { finalizeInventoryTransferInTx } from './utils/finalize-inventory-transfer.util';
import { buildWarehouseCommitteeMembers } from './utils/inventory-warehouse-committees.util';
import {
  type CommitteeScopeDeps,
  countEquipmentInWarehouseCategoryScope,
  evaluateEquipmentInCommitteeScope,
  isEmployeeInWarehouseCoverage,
  type WarehouseScopeEquipment,
} from './utils/resolve-warehouse-committee-scope.util';
import { ListCommitteesQueryDto } from './dto/list-committees-query.dto';
import { ListInventoryLinesQueryDto } from './dto/list-inventory-lines-query.dto';
import { ListSessionsQueryDto } from './dto/list-sessions-query.dto';
import { EquipmentDisposalListService } from './equipment-disposal-list.service';
import { provisionSessionCommitteeSlots } from './utils/provision-session-committee-slots.util';
import { deleteInventorySessionCascadeInTx } from './utils/delete-inventory-session-cascade.util';

const OPEN_INVENTORY_SESSION_STATUSES = ['draft', 'active', 'closing'] as const;

const INVENTORY_COUNTABLE_EQUIPMENT_STATUS = {
  notIn: ['rashodovano', 'za_rashod'] as const,
} satisfies Prisma.EnumEquipmentStatusFilter;

const SESSION_LIST_INCLUDE = {
  orgUnit: { include: { effectiveLocationCity: { include: { canton: true } } } },
  _count: { select: { committees: true } },
} satisfies Prisma.InventorySessionInclude;

const COMMITTEE_LIST_INCLUDE = {
  warehouse: { select: { id: true, name: true } },
  category: { select: { id: true, name: true } },
  members: { include: { employee: { select: { id: true, firstName: true, lastName: true } } } },
  _count: { select: { lines: true } },
} satisfies Prisma.InventoryCommitteeInclude;

const COMMITTEE_LINE_LIST_INCLUDE = {
  equipment: {
    select: {
      id: true,
      inventoryNumber: true,
      status: true,
      categoryId: true,
      currentHolder: { select: { id: true, firstName: true, lastName: true } },
    },
  },
  pendingAction: { select: { id: true, status: true } },
  generatedTransfer: { select: { id: true, status: true, documentNumber: true, scannedDocUrl: true } },
} satisfies Prisma.InventoryLineInclude;

const EQUIPMENT_SCOPE_INCLUDE = {
  category: { select: { id: true, name: true } },
  currentHolder: { select: { id: true, firstName: true, lastName: true, orgUnitId: true, title: true } },
  warehouse: { select: { id: true, name: true, cityId: true } },
} satisfies Prisma.EquipmentInclude;

const SESSION_SORT_FIELDS: Record<string, string> = {
  year: 'year',
  createdAt: 'createdAt',
  name: 'name',
};

const COMMITTEE_SORT_FIELDS: Record<string, string> = {
  createdAt: 'createdAt',
};

const INVENTORY_LINE_SORT_FIELDS: Record<string, string> = {
  createdAt: 'createdAt',
  status: 'status',
};

const EQUIPMENT_SCOPE_SORT_FIELDS: Record<string, string> = {
  inventoryNumber: 'inventoryNumber',
  entryDate: 'entryDate',
};

interface CommitteeMemberInput {
  employeeId: string;
  role: 'predsjednik' | 'clan';
}

interface CreateSessionInput {
  name: string;
  orgUnitId: string;
  year: number;
}

interface CreateCommitteeInput {
  sessionId: string;
  warehouseId: string;
  categoryId: string;
  inventoryMembers: CommitteeMemberInput[];
  disposalMembers: CommitteeMemberInput[];
  name?: string;
}

type UpdateCommitteeInput = Omit<CreateCommitteeInput, 'sessionId'>;

@Injectable()
export class InventoryCountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly locationResolutionService: LocationResolutionService,
    private readonly registrarScope: RegistrarScopeService,
    private readonly coordinatorScope: InventoryCoordinatorScopeService,
    private readonly productionModeService: InventoryProductionModeService,
    private readonly orgScopeService: OrgScopeService,
    private readonly notificationsService: NotificationsService,
    private readonly warehouseResolutionService: WarehouseResolutionService,
    private readonly settingsService: SettingsService,
    private readonly equipmentDisposalListService: EquipmentDisposalListService,
  ) {}

  private async assertInventoryCountEnabled(): Promise<void> {
    await this.settingsService.assertFeatureEnabled('features.inventory_count');
  }

  private async assertWarehouseInSessionScope(
    sessionOrgUnitId: string,
    warehouse: { cityId: string; orgUnitId: string | null },
  ): Promise<void> {
    if (warehouse.orgUnitId) {
      const orgUnitIds = await this.orgScopeService.expandOrgUnitIds([sessionOrgUnitId]);
      if (!orgUnitIds.includes(warehouse.orgUnitId)) {
        throw new BadRequestException('Warehouse must belong to the distribution org scope');
      }
      return;
    }
    const sessionCityId = await this.locationResolutionService.getEffectiveLocationForOrgUnit(
      sessionOrgUnitId,
    );
    if (!sessionCityId || warehouse.cityId !== sessionCityId) {
      throw new BadRequestException('Warehouse must belong to the distribution');
    }
  }

  private async assertWarehouseAllowedForSessionCommittee(
    sessionId: string,
    sessionOrgUnitId: string,
    warehouse: { id: string; cityId: string; orgUnitId: string | null },
  ): Promise<void> {
    const slot = await this.prisma.inventoryCommittee.findFirst({
      where: { sessionId, warehouseId: warehouse.id },
      select: { id: true },
    });
    if (slot) {
      return;
    }
    await this.assertWarehouseInSessionScope(sessionOrgUnitId, warehouse);
  }

  private async assertNoOpenInventorySession(excludeSessionId?: string): Promise<void> {
    const openSession = await this.prisma.inventorySession.findFirst({
      where: {
        status: { in: [...OPEN_INVENTORY_SESSION_STATUSES] },
        ...(excludeSessionId ? { id: { not: excludeSessionId } } : {}),
      },
      select: { id: true, name: true, status: true },
    });
    if (openSession) {
      throw new BadRequestException(
        `Postoji otvorena sesija popisa "${openSession.name}" (${openSession.status}). Zatvorite je prije kreiranja nove.`,
      );
    }
  }

  private async findOpenInventorySession(excludeSessionId?: string) {
    return this.prisma.inventorySession.findFirst({
      where: {
        status: { in: [...OPEN_INVENTORY_SESSION_STATUSES] },
        ...(excludeSessionId ? { id: { not: excludeSessionId } } : {}),
      },
      select: { id: true, name: true, status: true },
    });
  }

  private async listWarehousesForSessionSlots() {
    return this.prisma.warehouse.findMany({
      where: { isActive: true },
      select: { id: true, name: true, cityId: true },
      orderBy: { name: 'asc' },
    });
  }

  private async listWarehousesForSessionOrgUnit(sessionOrgUnitId: string) {
    const orgUnitIds = await this.orgScopeService.expandOrgUnitIds([sessionOrgUnitId]);
    const sessionCityId = await this.locationResolutionService.getEffectiveLocationForOrgUnit(
      sessionOrgUnitId,
    );
    return this.prisma.warehouse.findMany({
      where: {
        isActive: true,
        OR: [
          { orgUnitId: { in: orgUnitIds } },
          ...(sessionCityId ? [{ orgUnitId: null, cityId: sessionCityId }] : []),
        ],
      },
      select: { id: true, name: true, cityId: true },
      orderBy: { name: 'asc' },
    });
  }

  private async listParentAssetCategories() {
    return this.prisma.category.findMany({
      where: { parentId: null, categoryKind: 'ASSET' },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  private async provisionCommitteeSlotsForSession(
    sessionId: string,
    sessionName: string,
    _orgUnitId: string,
  ): Promise<{ created: number; skipped: number }> {
    const warehouses = await this.listWarehousesForSessionSlots();
    const categories = await this.listParentAssetCategories();
    if (warehouses.length === 0 || categories.length === 0) {
      return { created: 0, skipped: warehouses.length * categories.length };
    }
    return this.prisma.$transaction((tx) =>
      provisionSessionCommitteeSlots({
        tx,
        sessionId,
        sessionName,
        warehouses,
        categories,
      }),
    );
  }

  async reconcileSessionSlots(sessionId: string): Promise<{ created: number; skipped: number }> {
    await this.assertInventoryCountEnabled();
    const session = await this.prisma.inventorySession.findUnique({
      where: { id: sessionId },
      select: { id: true, name: true, orgUnitId: true, status: true },
    });
    if (!session) {
      throw new NotFoundException('Inventory session not found');
    }
    if (session.status !== 'draft') {
      throw new BadRequestException('Slots can only be reconciled for draft sessions');
    }
    return this.provisionCommitteeSlotsForSession(session.id, session.name, session.orgUnitId);
  }

  private async assertWarehouseInventoryEnabled(): Promise<void> {
    await this.settingsService.assertFeatureEnabled('features.warehouse_inventory');
  }

  async findCommittees(sessionId: string) {
    await this.assertInventoryCountEnabled();
    return this.prisma.inventoryCommittee.findMany({
      where: { sessionId },
      include: {
        warehouse: true,
        members: { include: { employee: true } },
        category: true,
        disposalCommission: { include: { members: { include: { employee: true } } } },
      },
      orderBy: [{ warehouse: { name: 'asc' } }, { category: { name: 'asc' } }, { createdAt: 'asc' }],
    });
  }

  async createSession(input: CreateSessionInput) {
    await this.assertInventoryCountEnabled();
    await this.assertNoOpenInventorySession();
    const name = input.name.trim();
    if (!name) {
      throw new BadRequestException('Name is required');
    }
    const orgUnit = await this.prisma.orgUnit.findUnique({
      where: { id: input.orgUnitId },
      select: { id: true, type: true },
    });
    if (!orgUnit) {
      throw new BadRequestException('Org unit not found');
    }
    if (orgUnit.type !== 'distribucija') {
      throw new BadRequestException('Inventory session must be created for a distribution org unit');
    }
    const session = await this.prisma.$transaction(async (tx) => {
      const created = await tx.inventorySession.create({
        data: {
          name,
          orgUnitId: input.orgUnitId,
          year: input.year,
          status: 'draft',
        },
        include: { orgUnit: true, committees: true },
      });
      const warehouses = await this.listWarehousesForSessionSlots();
      const categories = await this.listParentAssetCategories();
      if (warehouses.length > 0 && categories.length > 0) {
        await provisionSessionCommitteeSlots({
          tx,
          sessionId: created.id,
          sessionName: created.name,
          warehouses,
          categories,
        });
      }
      return created;
    });
    return this.prisma.inventorySession.findUniqueOrThrow({
      where: { id: session.id },
      include: { orgUnit: true, committees: true },
    });
  }

  async ensureDraftSessionForDistribution(
    orgUnitId: string,
    year: number,
  ): Promise<{ session: { id: string; name: string }; created: boolean; skipped?: boolean }> {
    await this.assertInventoryCountEnabled();
    const existing = await this.prisma.inventorySession.findUnique({
      where: { orgUnitId_year: { orgUnitId, year } },
      select: { id: true, name: true },
    });
    if (existing) {
      await this.provisionCommitteeSlotsForSession(existing.id, existing.name, orgUnitId);
      return { session: existing, created: false };
    }
    const openSession = await this.findOpenInventorySession();
    if (openSession) {
      return { session: { id: openSession.id, name: openSession.name }, created: false, skipped: true };
    }
    const session = await this.createSession({
      name: `POPIS ${year}`,
      orgUnitId,
      year,
    });
    await this.notificationsService.notifyInventoryDraftCreated(session.id, session.name, orgUnitId);
    return { session: { id: session.id, name: session.name }, created: true };
  }

  async ensureDraftSessionsForAllDistributions(year: number) {
    const distributions = await this.prisma.orgUnit.findMany({
      where: { type: 'distribucija' },
      select: { id: true, name: true },
    });
    const results = [];
    for (const distribution of distributions) {
      results.push(await this.ensureDraftSessionForDistribution(distribution.id, year));
    }
    return results;
  }

  async attemptAutoCloseSessionsForYear(year: number): Promise<void> {
    await this.assertInventoryCountEnabled();
    const sessions = await this.prisma.inventorySession.findMany({
      where: { year, status: 'active' },
      select: { id: true, name: true },
    });
    const actor = await this.resolveSystemActorUser();
    for (const session of sessions) {
      const pendingDisposal = await this.prisma.disposalInventoryApproval.count({
        where: { sessionId: session.id, status: 'pending' },
      });
      if (pendingDisposal > 0) {
        await this.notificationsService.notifyInventoryCloseBlocked(
          session.id,
          session.name,
          pendingDisposal,
        );
        continue;
      }
      try {
        await this.closeSession(actor, session.id);
        await this.notificationsService.notifyInventoryAutoClosed(session.id, session.name);
      } catch (error) {
        await this.notificationsService.notifyInventoryCloseBlocked(
          session.id,
          session.name,
          0,
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  }

  async createCommittee(input: CreateCommitteeInput, user?: AuthenticatedUser) {
    await this.assertInventoryCountEnabled();
    const session = await this.prisma.inventorySession.findUnique({
      where: { id: input.sessionId },
      include: { orgUnit: true },
    });
    if (!session) {
      throw new NotFoundException('Inventory session not found');
    }
    if (session.status !== 'draft') {
      throw new BadRequestException('Committees can only be added while session is draft');
    }
    if (!input.warehouseId?.trim()) {
      throw new BadRequestException('Warehouse is required');
    }
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: input.warehouseId },
      select: { id: true, name: true, cityId: true, orgUnitId: true, isActive: true },
    });
    if (!warehouse || !warehouse.isActive) {
      throw new BadRequestException('Warehouse not found or inactive');
    }
    if (user) {
      await this.coordinatorScope.assertCanManageWarehouse(user, warehouse.id);
    }
    await this.assertWarehouseAllowedForSessionCommittee(session.id, session.orgUnitId, warehouse);
    await this.validateCommitteeMembers(input.inventoryMembers, { requireUserForPresidentOnly: true });
    await this.validateCommitteeMembers(input.disposalMembers, { requireUserForPresidentOnly: true });
    await this.assertMembersEligibleForWarehouse(input.warehouseId, [
      ...input.inventoryMembers.map((row) => row.employeeId),
      ...input.disposalMembers.map((row) => row.employeeId),
    ]);
    const existing = await this.prisma.inventoryCommittee.findFirst({
      where: {
        sessionId: session.id,
        warehouseId: input.warehouseId,
        categoryId: input.categoryId,
      },
      select: { id: true, membersConfigured: true },
    });
    if (existing) {
      throw new BadRequestException(
        existing.membersConfigured
          ? 'Committee already exists for this warehouse and category in selected session'
          : 'Slot već postoji — dodijelite članove komisije putem uređivanja postojećeg slota',
      );
    }
    const manualCreateEnabled = await this.settingsService.getBooleanValue(
      'features.inventory_manual_committee_create',
      false,
    );
    if (!manualCreateEnabled) {
      throw new BadRequestException(
        'Ručno kreiranje komisije je isključeno — koristite auto-generisane slotove sesije',
      );
    }
    const category = await this.prisma.category.findUnique({ where: { id: input.categoryId } });
    if (!category) {
      throw new BadRequestException('Category not found');
    }
    if (category.categoryKind !== 'ASSET') {
      throw new BadRequestException('Only ASSET categories can be assigned to inventory committees');
    }
    if (category.parentId !== null) {
      throw new BadRequestException('Only parent categories can be assigned to inventory committees');
    }
    const setupOptions = await this.getCommitteeSetupOptions(session.id, input.warehouseId);
    const allowedCategory = setupOptions.categories.find((row) => row.id === input.categoryId);
    if (!allowedCategory) {
      throw new BadRequestException('Category is not available for this warehouse in the session');
    }
    return this.prisma.$transaction(async (tx) => {
      const disposal = await tx.disposalCommission.create({
        data: {
          cityId: warehouse.cityId,
          name: `${session.name} — ${warehouse.name} — ${category.name} — rashod`,
          isActive: true,
          members: { create: input.disposalMembers },
        },
      });
      const committee = await tx.inventoryCommittee.create({
        data: {
          sessionId: session.id,
          warehouseId: input.warehouseId,
          categoryId: input.categoryId,
          name: input.name?.trim() || null,
          disposalCommissionId: disposal.id,
          membersConfigured: true,
          members: { create: input.inventoryMembers },
        },
        include: {
          warehouse: true,
          category: true,
          members: { include: { employee: true } },
          disposalCommission: { include: { members: { include: { employee: true } } } },
          session: { include: { orgUnit: true } },
        },
      });
      await this.equipmentDisposalListService.assignListedItemsToCommitteeInTx(tx, {
        sessionId: session.id,
        warehouseId: input.warehouseId,
        parentCategoryId: input.categoryId,
        disposalCommissionId: disposal.id,
      });
      return committee;
    });
  }

  async getSessionWarehouses(sessionId: string) {
    await this.assertInventoryCountEnabled();
    const session = await this.prisma.inventorySession.findUnique({
      where: { id: sessionId },
      select: { orgUnitId: true, status: true },
    });
    if (!session) {
      throw new NotFoundException('Inventory session not found');
    }
    const committees = await this.prisma.inventoryCommittee.findMany({
      where: { sessionId, warehouseId: { not: null } },
      select: { warehouse: { select: { id: true, name: true } } },
      distinct: ['warehouseId'],
      orderBy: { warehouse: { name: 'asc' } },
    });
    if (committees.length > 0) {
      return committees
        .map((row) => row.warehouse)
        .filter((row): row is { id: string; name: string } => Boolean(row));
    }
    return this.listWarehousesForSessionSlots();
  }

  async getCommitteeSetupOptions(sessionId: string, warehouseId: string, excludeCommitteeId?: string) {
    await this.assertInventoryCountEnabled();
    const session = await this.prisma.inventorySession.findUnique({
      where: { id: sessionId },
      select: { id: true, orgUnitId: true, status: true },
    });
    if (!session) {
      throw new NotFoundException('Inventory session not found');
    }
    if (session.status !== 'draft') {
      throw new BadRequestException('Setup options are only available for draft sessions');
    }
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: warehouseId },
      select: { id: true, name: true, cityId: true, orgUnitId: true, isActive: true },
    });
    if (!warehouse || !warehouse.isActive) {
      throw new BadRequestException('Warehouse not found or inactive');
    }
    await this.assertWarehouseAllowedForSessionCommittee(sessionId, session.orgUnitId, warehouse);
    const assignedCategoryIds = new Set(
      (
        await this.prisma.inventoryCommittee.findMany({
          where: {
            sessionId,
            warehouseId,
            membersConfigured: true,
            ...(excludeCommitteeId ? { id: { not: excludeCommitteeId } } : {}),
          },
          select: { categoryId: true },
        })
      ).map((row) => row.categoryId),
    );
    const editingCommittee = excludeCommitteeId
      ? await this.prisma.inventoryCommittee.findUnique({
          where: { id: excludeCommitteeId },
          select: { categoryId: true, warehouseId: true },
        })
      : null;
    const parentCategories = await this.prisma.category.findMany({
      where: { parentId: null, categoryKind: 'ASSET' },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    const deps = this.buildCommitteeScopeDeps();
    const candidateEquipment = await this.loadCandidateEquipmentForWarehouse(warehouse);
    const categories: { id: string; name: string; equipmentCount: number; alreadyAssigned: boolean }[] = [];
    for (const category of parentCategories) {
      const alreadyAssigned = assignedCategoryIds.has(category.id);
      const isEditingThisCategory =
        editingCommittee?.warehouseId === warehouseId &&
        editingCommittee.categoryId === category.id;
      if (alreadyAssigned && !isEditingThisCategory) {
        continue;
      }
      const equipmentCount = await countEquipmentInWarehouseCategoryScope(
        deps,
        {
          categoryId: category.id,
          warehouseId,
          sessionOrgUnitId: session.orgUnitId,
        },
        candidateEquipment,
      );
      categories.push({
        id: category.id,
        name: category.name,
        equipmentCount,
        alreadyAssigned: false,
      });
    }
    const eligibleEmployees = await this.resolveEligibleEmployeesForWarehouse(warehouse);
    return {
      warehouse: { id: warehouse.id, name: warehouse.name },
      categories,
      eligibleEmployees,
    };
  }

  async deleteSession(sessionId: string) {
    await this.assertInventoryCountEnabled();
    const session = await this.prisma.inventorySession.findUnique({
      where: { id: sessionId },
      select: { id: true, status: true },
    });
    if (!session) {
      throw new NotFoundException('Inventory session not found');
    }
    if (session.status !== 'draft') {
      throw new BadRequestException('Only draft sessions can be deleted');
    }
    await this.prisma.$transaction(async (tx) => {
      await deleteInventorySessionCascadeInTx({ tx, sessionId });
    });
    return { ok: true };
  }

  async deleteCommittee(committeeId: string, user?: AuthenticatedUser) {
    await this.assertInventoryCountEnabled();
    const committee = await this.prisma.inventoryCommittee.findUnique({
      where: { id: committeeId },
      include: { session: true, _count: { select: { lines: true } } },
    });
    if (!committee) {
      throw new NotFoundException('Inventory committee not found');
    }
    if (committee.session.status !== 'draft') {
      throw new BadRequestException('Committees can only be deleted while session is draft');
    }
    if (!committee.membersConfigured) {
      throw new BadRequestException('Auto-generisani slotovi se ne mogu brisati');
    }
    if (user?.role !== 'admin') {
      throw new ForbiddenException('Samo administrator može brisati konfigurisane komisije');
    }
    if (committee._count.lines > 0) {
      throw new BadRequestException('Komisija ima unesene linije i ne može se obrisati');
    }
    if (user && committee.warehouseId) {
      await this.coordinatorScope.assertCanManageWarehouse(user, committee.warehouseId);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.inventoryCommittee.delete({ where: { id: committeeId } });
      if (committee.disposalCommissionId) {
        await tx.disposalCommission.delete({ where: { id: committee.disposalCommissionId } });
      }
    });
    return { ok: true };
  }

  async updateCommittee(committeeId: string, input: UpdateCommitteeInput, user?: AuthenticatedUser) {
    await this.assertInventoryCountEnabled();
    const committee = await this.prisma.inventoryCommittee.findUnique({
      where: { id: committeeId },
      include: { session: { include: { orgUnit: true } } },
    });
    if (!committee) {
      throw new NotFoundException('Inventory committee not found');
    }
    if (committee.session.status !== 'draft') {
      throw new BadRequestException('Committees can only be updated while session is draft');
    }
    const warehouseId = committee.warehouseId;
    const categoryId = committee.categoryId;
    if (!warehouseId) {
      throw new BadRequestException('Warehouse is required');
    }
    if (input.warehouseId && input.warehouseId !== warehouseId) {
      throw new BadRequestException('Skladište slota se ne može mijenjati');
    }
    if (input.categoryId && input.categoryId !== categoryId) {
      throw new BadRequestException('Kategorija slota se ne može mijenjati');
    }
    await this.validateCommitteeMembers(input.inventoryMembers, { requireUserForPresidentOnly: true });
    await this.validateCommitteeMembers(input.disposalMembers, { requireUserForPresidentOnly: true });
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: warehouseId },
      select: { id: true, name: true, cityId: true, orgUnitId: true, isActive: true },
    });
    if (!warehouse || !warehouse.isActive) {
      throw new BadRequestException('Warehouse not found or inactive');
    }
    if (user) {
      await this.coordinatorScope.assertCanManageWarehouse(user, warehouse.id);
    }
    await this.assertWarehouseAllowedForSessionCommittee(
      committee.sessionId,
      committee.session.orgUnitId,
      warehouse,
    );
    await this.assertMembersEligibleForWarehouse(warehouseId, [
      ...input.inventoryMembers.map((row) => row.employeeId),
      ...input.disposalMembers.map((row) => row.employeeId),
    ]);
    const category = await this.prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) {
      throw new BadRequestException('Category not found');
    }
    if (category.categoryKind !== 'ASSET' || category.parentId !== null) {
      throw new BadRequestException('Only parent ASSET categories can be assigned to inventory committees');
    }
    const wasConfigured = committee.membersConfigured;
    return this.prisma.$transaction(async (tx) => {
      if (committee.disposalCommissionId) {
        await tx.disposalCommission.update({
          where: { id: committee.disposalCommissionId },
          data: {
            name: `${committee.session.name} — ${warehouse.name} — ${category.name} — rashod`,
          },
        });
        await tx.disposalCommissionMember.deleteMany({
          where: { commissionId: committee.disposalCommissionId },
        });
        await tx.disposalCommissionMember.createMany({
          data: input.disposalMembers.map((member) => ({
            commissionId: committee.disposalCommissionId!,
            employeeId: member.employeeId,
            role: member.role,
          })),
        });
      } else {
        const disposal = await tx.disposalCommission.create({
          data: {
            cityId: warehouse.cityId,
            name: `${committee.session.name} — ${warehouse.name} — ${category.name} — rashod`,
            isActive: true,
            members: { create: input.disposalMembers },
          },
        });
        await tx.inventoryCommittee.update({
          where: { id: committeeId },
          data: { disposalCommissionId: disposal.id },
        });
        committee.disposalCommissionId = disposal.id;
      }
      await tx.inventoryCommitteeMember.deleteMany({ where: { committeeId } });
      await tx.inventoryCommitteeMember.createMany({
        data: input.inventoryMembers.map((member) => ({
          committeeId,
          employeeId: member.employeeId,
          role: member.role,
        })),
      });
      const updated = await tx.inventoryCommittee.update({
        where: { id: committeeId },
        data: {
          name: input.name?.trim() || committee.name,
          membersConfigured: true,
        },
        include: {
          warehouse: true,
          category: true,
          members: { include: { employee: true } },
          disposalCommission: { include: { members: { include: { employee: true } } } },
          session: { include: { orgUnit: true } },
        },
      });
      if (!wasConfigured && committee.disposalCommissionId) {
        await this.equipmentDisposalListService.assignListedItemsToCommitteeInTx(tx, {
          sessionId: committee.sessionId,
          warehouseId,
          parentCategoryId: categoryId,
          disposalCommissionId: committee.disposalCommissionId,
        });
      }
      return updated;
    });
  }

  async getPrintScopeForUser(user: AuthenticatedUser, committeeId: string) {
    await this.assertInventoryCountEnabled();
    const committee = await this.prisma.inventoryCommittee.findUnique({
      where: { id: committeeId },
      include: {
        warehouse: true,
        category: true,
        members: { include: { employee: true } },
        session: { include: { orgUnit: true } },
      },
    });
    if (!committee) {
      throw new NotFoundException('Inventory committee not found');
    }
    if (user.role !== 'admin') {
      const actor = await this.prisma.user.findUnique({
        where: { id: user.id },
        select: { employeeId: true },
      });
      if (!actor?.employeeId) {
        throw new ForbiddenException('Only committee members can access inventory scope');
      }
      const isMember = committee.members.some((member) => member.employeeId === actor.employeeId);
      if (!isMember) {
        throw new ForbiddenException('Only committee members can access inventory scope');
      }
    }
    const equipment = await this.resolveCommitteeEquipment(committeeId);
    return { committee, equipment };
  }

  async getCommitteeReportForUser(user: AuthenticatedUser, committeeId: string) {
    const scope = await this.getPrintScopeForUser(user, committeeId);
    const lines = await this.prisma.inventoryLine.findMany({
      where: { committeeId },
      include: {
        pendingAction: true,
        generatedTransfer: true,
        equipment: { include: { category: true, currentHolder: true, warehouse: true } },
      },
    });
    const lineByEquipmentId = new Map(lines.map((line) => [line.equipmentId, line]));
    const items = scope.equipment.map((equipment) => {
      const line = lineByEquipmentId.get(equipment.id);
      return {
        equipmentId: equipment.id,
        inventoryNumber: equipment.inventoryNumber,
        categoryId: equipment.categoryId,
        categoryName: equipment.category?.name ?? null,
        currentHolder: equipment.currentHolder
          ? {
              id: equipment.currentHolder.id,
              firstName: equipment.currentHolder.firstName,
              lastName: equipment.currentHolder.lastName,
              title: equipment.currentHolder.title,
              orgUnitId: equipment.currentHolder.orgUnitId,
            }
          : null,
        warehouse: equipment.warehouse
          ? { id: equipment.warehouse.id, name: equipment.warehouse.name, cityId: equipment.warehouse.cityId }
          : null,
        line: line
          ? {
              id: line.id,
              status: line.status,
              note: line.note,
              pendingActionStatus: line.pendingAction?.status ?? null,
              relocationTargetType: line.relocationTargetType,
              relocationWarehouseId: line.relocationWarehouseId,
              relocationToPersonId: line.relocationToPersonId,
              generatedTransfer: line.generatedTransfer
                ? {
                    id: line.generatedTransfer.id,
                    status: line.generatedTransfer.status,
                    documentNumber: line.generatedTransfer.documentNumber,
                    scannedDocUrl: line.generatedTransfer.scannedDocUrl,
                  }
                : null,
              createdAt: line.createdAt,
              updatedAt: line.updatedAt,
            }
          : null,
      };
    });
    const groups = new Map<string, { key: string; label: string; items: typeof items }>();
    for (const item of items) {
      const key = item.currentHolder ? `person:${item.currentHolder.id}` : `warehouse:${item.warehouse?.id ?? 'unknown'}`;
      const label = item.currentHolder
        ? `${item.currentHolder.firstName} ${item.currentHolder.lastName}`
        : item.warehouse?.name ?? 'Skladište';
      const existing = groups.get(key);
      if (existing) {
        existing.items.push(item);
        continue;
      }
      groups.set(key, { key, label, items: [item] });
    }
    return {
      committee: scope.committee,
      groups: [...groups.values()],
    };
  }

  async resolveCommitteeEquipment(committeeId: string) {
    await this.assertInventoryCountEnabled();
    const where = await this.buildCommitteeEquipmentWhere(committeeId);
    return this.prisma.equipment.findMany({
      where,
      include: EQUIPMENT_SCOPE_INCLUDE,
      orderBy: { inventoryNumber: 'asc' },
    });
  }

  async findCommitteeEquipmentScopePaginated(
    user: AuthenticatedUser,
    committeeId: string,
    query: ListCommitteesQueryDto,
  ) {
    await this.assertInventoryCountEnabled();
    await this.assertCommitteeAccess(user, committeeId);
    const { pageSize, maxPageSize } = await resolveListPageSize(query.pageSize, this.settingsService);
    const { page, take } = parsePagination(query, { defaultPageSize: pageSize, maxPageSize });
    const where = await this.buildCommitteeEquipmentWhere(committeeId);
    const filters: Prisma.EquipmentWhereInput[] = [where];
    const searchWhere = buildContainsSearchWhere(query.search, ['inventoryNumber']);
    if (searchWhere) {
      filters.push(searchWhere);
    }
    const combinedWhere: Prisma.EquipmentWhereInput =
      filters.length === 1 ? filters[0]! : { AND: filters };
    const orderBy = buildOrderBy(
      query.sortBy,
      query.sortDir,
      EQUIPMENT_SCOPE_SORT_FIELDS,
      'inventoryNumber',
    );
    return paginate({
      findMany: (args) =>
        this.prisma.equipment.findMany({
          ...args,
          include: EQUIPMENT_SCOPE_INCLUDE,
        }),
      count: (args) => this.prisma.equipment.count(args),
      where: combinedWhere,
      orderBy,
      page,
      pageSize: take,
    });
  }

  async findCommitteesPaginated(
    user: AuthenticatedUser,
    sessionId: string,
    query: ListCommitteesQueryDto,
  ) {
    await this.assertInventoryCountEnabled();
    await this.assertSessionAccess(user, sessionId);
    const { pageSize, maxPageSize } = await resolveListPageSize(query.pageSize, this.settingsService);
    const { page, take } = parsePagination(query, { defaultPageSize: pageSize, maxPageSize });
    const where = await this.buildSessionCommitteesWhere(user, sessionId);
    const orderBy = buildOrderBy(query.sortBy, query.sortDir, COMMITTEE_SORT_FIELDS, 'createdAt');
    return paginate({
      findMany: (args) =>
        this.prisma.inventoryCommittee.findMany({
          ...args,
          include: COMMITTEE_LIST_INCLUDE,
        }),
      count: (args) => this.prisma.inventoryCommittee.count(args),
      where,
      orderBy,
      page,
      pageSize: take,
    });
  }

  async findCommitteeLinesPaginated(
    user: AuthenticatedUser,
    committeeId: string,
    query: ListInventoryLinesQueryDto,
  ) {
    await this.assertInventoryCountEnabled();
    await this.assertCommitteeAccess(user, committeeId);
    const { pageSize, maxPageSize } = await resolveListPageSize(query.pageSize, this.settingsService);
    const { page, take } = parsePagination(query, { defaultPageSize: pageSize, maxPageSize });
    const filters: Prisma.InventoryLineWhereInput[] = [{ committeeId }];
    if (query.status) {
      filters.push({ status: query.status });
    }
    if (query.search?.trim()) {
      filters.push({
        equipment: { inventoryNumber: { contains: query.search.trim() } },
      });
    }
    const where: Prisma.InventoryLineWhereInput =
      filters.length === 1 ? filters[0]! : { AND: filters };
    const orderBy = buildOrderBy(
      query.sortBy,
      query.sortDir,
      INVENTORY_LINE_SORT_FIELDS,
      'createdAt',
    );
    return paginate({
      findMany: (args) =>
        this.prisma.inventoryLine.findMany({
          ...args,
          include: COMMITTEE_LINE_LIST_INCLUDE,
        }),
      count: (args) => this.prisma.inventoryLine.count(args),
      where,
      orderBy,
      page,
      pageSize: take,
    });
  }

  async findSessionsForUser(user: AuthenticatedUser, query: ListSessionsQueryDto) {
    await this.assertInventoryCountEnabled();
    const { pageSize, maxPageSize } = await resolveListPageSize(query.pageSize, this.settingsService);
    const { page, take } = parsePagination(query, { defaultPageSize: pageSize, maxPageSize });
    const where = await this.buildSessionsWhere(user, query.orgUnitId);
    const orderBy = buildOrderBy(query.sortBy, query.sortDir, SESSION_SORT_FIELDS, 'year');
    return paginate({
      findMany: (args) =>
        this.prisma.inventorySession.findMany({
          ...args,
          include: SESSION_LIST_INCLUDE,
          orderBy: [orderBy, { createdAt: 'desc' }],
        }),
      count: (args) => this.prisma.inventorySession.count(args),
      where,
      orderBy,
      page,
      pageSize: take,
    });
  }

  private async buildSessionsWhere(
    user: AuthenticatedUser,
    orgUnitId?: string,
  ): Promise<Prisma.InventorySessionWhereInput> {
    const filters: Prisma.InventorySessionWhereInput[] = [];
    if (orgUnitId) {
      filters.push({ orgUnitId });
    }
    if (user.role !== 'admin' && user.role !== 'evidenticar') {
      if (user.role === 'popis_koordinator') {
        const warehouseIds = await this.coordinatorScope.getAssignedWarehouseIds(user);
        const orgUnitIds = await this.coordinatorScope.getAssignedOrgUnitIds(user);
        if (warehouseIds.length === 0 && orgUnitIds.length === 0) {
          return { id: { in: [] } };
        }
        const orFilters: Prisma.InventorySessionWhereInput[] = [];
        if (orgUnitIds.length > 0) {
          orFilters.push({ orgUnitId: { in: orgUnitIds } });
        }
        if (warehouseIds.length > 0) {
          orFilters.push({
            committees: { some: { warehouseId: { in: warehouseIds } } },
          });
        }
        filters.push(orFilters.length === 1 ? orFilters[0]! : { OR: orFilters });
      } else {
      const actor = await this.prisma.user.findUnique({
        where: { id: user.id },
        select: { employeeId: true },
      });
      if (!actor?.employeeId) {
        return { id: { in: [] } };
      }
      filters.push({
        committees: { some: { members: { some: { employeeId: actor.employeeId } } } },
      });
      }
    }
    if (filters.length === 0) {
      return {};
    }
    return filters.length === 1 ? filters[0]! : { AND: filters };
  }

  private async buildSessionCommitteesWhere(
    user: AuthenticatedUser,
    sessionId: string,
  ): Promise<Prisma.InventoryCommitteeWhereInput> {
    const base: Prisma.InventoryCommitteeWhereInput = { sessionId };
    if (user.role === 'admin' || user.role === 'evidenticar') {
      return base;
    }
    if (user.role === 'popis_koordinator') {
      const warehouseIds = await this.coordinatorScope.getAssignedWarehouseIds(user);
      if (warehouseIds.length === 0) {
        return { id: { in: [] } };
      }
      return { ...base, warehouseId: { in: warehouseIds } };
    }
    const actor = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { employeeId: true },
    });
    if (!actor?.employeeId) {
      return { id: { in: [] } };
    }
    return {
      ...base,
      members: { some: { employeeId: actor.employeeId } },
    };
  }

  private async assertSessionAccess(user: AuthenticatedUser, sessionId: string): Promise<void> {
    const scopeWhere = await this.buildSessionsWhere(user);
    const session = await this.prisma.inventorySession.findFirst({
      where: { id: sessionId, ...scopeWhere },
      select: { id: true },
    });
    if (!session) {
      throw new ForbiddenException('Session outside your scope');
    }
  }

  private async assertCommitteeAccess(user: AuthenticatedUser, committeeId: string): Promise<void> {
    const committee = await this.prisma.inventoryCommittee.findUnique({
      where: { id: committeeId },
      select: { sessionId: true },
    });
    if (!committee) {
      throw new NotFoundException('Inventory committee not found');
    }
    await this.assertSessionAccess(user, committee.sessionId);
    if (user.role === 'admin' || user.role === 'evidenticar') {
      return;
    }
    const actor = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { employeeId: true },
    });
    if (!actor?.employeeId) {
      throw new ForbiddenException('Only committee members can access inventory scope');
    }
    const isMember = await this.prisma.inventoryCommitteeMember.findFirst({
      where: { committeeId, employeeId: actor.employeeId },
      select: { employeeId: true },
    });
    if (!isMember) {
      throw new ForbiddenException('Only committee members can access inventory scope');
    }
  }

  private async buildCommitteeEquipmentWhere(
    committeeId: string,
  ): Promise<Prisma.EquipmentWhereInput> {
    const committee = await this.prisma.inventoryCommittee.findUnique({
      where: { id: committeeId },
      include: { session: true },
    });
    if (!committee) {
      throw new NotFoundException('Inventory committee not found');
    }
    const sessionCityId = await this.locationResolutionService.getEffectiveLocationForOrgUnit(
      committee.session.orgUnitId,
    );
    if (!sessionCityId) {
      throw new BadRequestException('Session distribution must have effective location city configured');
    }
    const categoryIds = [...(await this.registrarScope.expandCategoryIds([committee.categoryId]))];
    const base: Prisma.EquipmentWhereInput = {
      status: INVENTORY_COUNTABLE_EQUIPMENT_STATUS,
      category: { categoryKind: 'ASSET' },
      categoryId: { in: categoryIds },
    };
    if (!committee.warehouseId) {
      const warehousesInCity = await this.prisma.warehouse.findMany({
        where: { cityId: sessionCityId },
        select: { id: true },
      });
      const orgUnitsInCity = await this.prisma.orgUnit.findMany({
        where: { effectiveLocationCityId: sessionCityId },
        select: { id: true },
      });
      return {
        ...base,
        OR: [
          { warehouseId: { in: warehousesInCity.map((row) => row.id) } },
          { currentHolder: { orgUnitId: { in: orgUnitsInCity.map((row) => row.id) } } },
        ],
      };
    }
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: committee.warehouseId },
      select: { id: true, orgUnitId: true },
    });
    if (!warehouse) {
      throw new BadRequestException('Committee warehouse not found');
    }
    const coverageOrgUnitIds = warehouse.orgUnitId
      ? await this.orgScopeService.expandOrgUnitIds([warehouse.orgUnitId])
      : [];
    const orConditions: Prisma.EquipmentWhereInput[] = [
      { warehouseId: warehouse.id, status: 'skladiste' },
    ];
    if (coverageOrgUnitIds.length > 0) {
      orConditions.push({
        status: 'zaduzeno',
        currentHolder: { orgUnitId: { in: coverageOrgUnitIds } },
      });
    }
    return { ...base, OR: orConditions };
  }

  async getFreezeBannerForUser(user: AuthenticatedUser) {
    await this.assertInventoryCountEnabled();
    const cityIds = await this.resolveFreezeCityIdsForUser(user);
    const activeWhere: Prisma.InventorySessionWhereInput = { status: 'active' };
    if (user.role !== 'admin') {
      if (cityIds.length === 0) {
        return { activeSessions: [], productionLockSessions: [] };
      }
      activeWhere.orgUnit = { effectiveLocationCityId: { in: cityIds } };
    }
    const sessions = await this.prisma.inventorySession.findMany({
      where: activeWhere,
      select: {
        id: true,
        name: true,
        year: true,
        orgUnit: {
          select: {
            id: true,
            name: true,
            effectiveLocationCity: { select: { name: true } },
          },
        },
      },
      orderBy: [{ year: 'desc' }, { createdAt: 'desc' }],
    });
    const productionLockSessions: {
      id: string;
      name: string;
      year: number;
      orgUnitName: string;
      cityName: string | null;
    }[] = [];
    if (await this.productionModeService.isProductionModeEnabled()) {
      const draftWhere: Prisma.InventorySessionWhereInput = {
        status: { in: ['draft', 'active', 'closing'] },
      };
      if (user.role !== 'admin' && cityIds.length > 0) {
        draftWhere.orgUnit = { effectiveLocationCityId: { in: cityIds } };
      } else if (user.role !== 'admin' && cityIds.length === 0) {
        draftWhere.id = { in: [] };
      }
      const candidates = await this.prisma.inventorySession.findMany({
        where: draftWhere,
        select: {
          id: true,
          name: true,
          year: true,
          orgUnit: {
            select: {
              id: true,
              name: true,
              effectiveLocationCity: { select: { name: true } },
            },
          },
        },
      });
      for (const row of candidates) {
        if (await this.productionModeService.isProductionLockActive(row.orgUnit.id)) {
          productionLockSessions.push({
            id: row.id,
            name: row.name,
            year: row.year,
            orgUnitName: row.orgUnit.name,
            cityName: row.orgUnit.effectiveLocationCity?.name ?? null,
          });
        }
      }
    }
    return {
      activeSessions: sessions.map((row) => ({
        id: row.id,
        name: row.name,
        year: row.year,
        orgUnitName: row.orgUnit.name,
        cityName: row.orgUnit.effectiveLocationCity?.name ?? null,
      })),
      productionLockSessions,
    };
  }

  private async resolveFreezeCityIdsForUser(user: AuthenticatedUser): Promise<string[]> {
    const citySet = new Set<string>();
    if (user.role === 'evidenticar') {
      const assignments = await this.prisma.registrarAssignment.findMany({
        where: { userId: user.id },
        include: { warehouse: { select: { cityId: true } } },
      });
      for (const assignment of assignments) {
        citySet.add(assignment.warehouse.cityId);
      }
    }
    if (user.role === 'skladistar') {
      const keepers = await this.prisma.warehouseKeeper.findMany({
        where: { userId: user.id },
        include: { warehouse: { select: { cityId: true } } },
      });
      for (const keeper of keepers) {
        citySet.add(keeper.warehouse.cityId);
      }
    }
    const actor = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { employeeId: true },
    });
    if (actor?.employeeId) {
      const employee = await this.prisma.employee.findUnique({
        where: { id: actor.employeeId },
        select: { orgUnitId: true },
      });
      if (employee) {
        const cityId = await this.locationResolutionService.getEffectiveLocationForOrgUnit(
          employee.orgUnitId,
        );
        if (cityId) {
          citySet.add(cityId);
        }
      }
    }
    return [...citySet];
  }

  async activateSession(sessionId: string) {
    await this.assertInventoryCountEnabled();
    const session = await this.getSessionOrThrow(sessionId);
    if (session.status !== 'draft') {
      throw new BadRequestException('Only draft sessions can be activated');
    }
    const pendingSlots = await this.prisma.inventoryCommittee.count({
      where: { sessionId, membersConfigured: false },
    });
    if (pendingSlots > 0) {
      throw new BadRequestException(
        `Postoji ${pendingSlots} slotova bez dodijeljenih članova — konfigurišite sve komisije prije aktivacije`,
      );
    }
    const unassignedListed = await this.equipmentDisposalListService.countUnassignedListed(sessionId);
    if (unassignedListed > 0) {
      throw new BadRequestException(
        `Na listi za rashod ima ${unassignedListed} stavki bez dodijeljene komisije — kreirajte komisije za sva skladišta/kategorije prije aktivacije`,
      );
    }
    const sessionCityId = await this.locationResolutionService.getEffectiveLocationForOrgUnit(
      session.orgUnitId,
    );
    if (!sessionCityId) {
      throw new BadRequestException('Distribution must have effective location city configured');
    }
    const startDate = session.startDate ?? new Date(session.year, 11, 1);
    const endDate = session.endDate ?? new Date(session.year, 11, 31);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.inventorySession.update({
        where: { id: sessionId },
        data: { status: 'active', startDate, endDate },
      });
      await this.createWarehouseCommitteesForSession(tx, sessionId, sessionCityId);
      return updated;
    });
  }

  async findWarehouseCommittees(sessionId: string) {
    await this.assertWarehouseInventoryEnabled();
    return this.prisma.inventoryWarehouseCommittee.findMany({
      where: { sessionId },
      include: {
        warehouse: true,
        members: { include: { employee: true } },
        lines: { include: { stockLot: { include: { category: true } } } },
      },
      orderBy: { warehouse: { name: 'asc' } },
    });
  }

  async findWarehouseCommitteesForUser(user: AuthenticatedUser) {
    await this.assertWarehouseInventoryEnabled();
    const actor = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { employeeId: true },
    });
    if (!actor?.employeeId) {
      return [];
    }
    return this.prisma.inventoryWarehouseCommittee.findMany({
      where: {
        session: { status: 'active' },
        members: { some: { employeeId: actor.employeeId } },
      },
      include: {
        warehouse: true,
        session: true,
        members: { include: { employee: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getWarehouseCommitteeScope(user: AuthenticatedUser, committeeId: string) {
    await this.assertWarehouseInventoryEnabled();
    const committee = await this.getWarehouseCommitteeOrThrow(committeeId);
    await this.assertWarehouseCommitteeMember(user, committee);
    const lots = await this.prisma.warehouseStockLot.findMany({
      where: {
        warehouseId: committee.warehouseId,
        quantityOnHand: { gt: 0 },
      },
      include: { category: true },
      orderBy: [{ productName: 'asc' }, { entryDate: 'desc' }],
    });
    const lines = await this.prisma.inventoryWarehouseLine.findMany({
      where: { committeeId },
    });
    const lineByLot = new Map(lines.map((row) => [row.stockLotId, row]));
    return {
      committee,
      items: lots.map((lot) => ({
        stockLot: lot,
        line: lineByLot.get(lot.id) ?? null,
      })),
    };
  }

  async recordWarehouseLine(
    user: AuthenticatedUser,
    committeeId: string,
    stockLotId: string,
    status: InventoryWarehouseLineStatus,
    quantityCounted: number,
    note?: string,
  ) {
    await this.assertWarehouseInventoryEnabled();
    if (user.role === 'admin') {
      throw new ForbiddenException('Administrator cannot record warehouse inventory lines');
    }
    const committee = await this.getWarehouseCommitteeOrThrow(committeeId);
    await this.assertWarehouseCommitteeMember(user, committee);
    if (committee.isClosed) {
      throw new BadRequestException('Warehouse committee list is closed');
    }
    if (committee.session.status !== 'active') {
      throw new BadRequestException('Session is not active');
    }
    if (status === 'ostecena' && !note?.trim()) {
      throw new BadRequestException('Note is required for damaged stock');
    }
    if (status === 'nije_prisutna' && !note?.trim()) {
      throw new BadRequestException('Note is required for missing stock');
    }
    const lot = await this.prisma.warehouseStockLot.findUnique({ where: { id: stockLotId } });
    if (!lot || lot.warehouseId !== committee.warehouseId) {
      throw new BadRequestException('Stock lot is not in this warehouse committee scope');
    }
    if (lot.quantityOnHand <= 0) {
      throw new BadRequestException('Stock lot has no units on hand');
    }
    if (quantityCounted < 0) {
      throw new BadRequestException('quantityCounted cannot be negative');
    }
    return this.prisma.inventoryWarehouseLine.upsert({
      where: { committeeId_stockLotId: { committeeId, stockLotId } },
      create: {
        committeeId,
        stockLotId,
        status,
        quantityCounted,
        note: note?.trim() || null,
      },
      update: {
        status,
        quantityCounted,
        note: note?.trim() || null,
      },
      include: { stockLot: { include: { category: true } } },
    });
  }

  async closeWarehouseCommittee(user: AuthenticatedUser, committeeId: string) {
    await this.assertWarehouseInventoryEnabled();
    const committee = await this.getWarehouseCommitteeOrThrow(committeeId);
    const actor = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { employeeId: true },
    });
    if (!actor?.employeeId) {
      throw new ForbiddenException('Only committee president can close the list');
    }
    const president = committee.members.find(
      (member) => member.role === 'predsjednik' && member.employeeId === actor.employeeId,
    );
    if (!president) {
      throw new ForbiddenException('Only committee president can close the list');
    }
    return this.prisma.inventoryWarehouseCommittee.update({
      where: { id: committeeId },
      data: {
        isClosed: true,
        closedAt: new Date(),
        closedByUserId: user.id,
      },
      include: {
        warehouse: true,
        members: { include: { employee: true } },
      },
    });
  }

  private async createWarehouseCommitteesForSession(
    tx: Prisma.TransactionClient,
    sessionId: string,
    sessionCityId: string,
  ): Promise<void> {
    const warehouses = await tx.warehouse.findMany({
      where: { cityId: sessionCityId, isActive: true },
      include: {
        keepers: {
          include: { user: { select: { id: true, employeeId: true } } },
        },
      },
    });
    for (const warehouse of warehouses) {
      const existing = await tx.inventoryWarehouseCommittee.findFirst({
        where: { sessionId, warehouseId: warehouse.id },
        select: { id: true },
      });
      if (existing) {
        continue;
      }
      const keeperCandidates = warehouse.keepers.map((row) => ({
        userId: row.userId,
        employeeId: row.user.employeeId,
      }));
      const members = buildWarehouseCommitteeMembers(warehouse.name, keeperCandidates);
      await tx.inventoryWarehouseCommittee.create({
        data: {
          sessionId,
          warehouseId: warehouse.id,
          members: { create: members },
        },
      });
    }
  }

  private async getWarehouseCommitteeOrThrow(committeeId: string) {
    const committee = await this.prisma.inventoryWarehouseCommittee.findUnique({
      where: { id: committeeId },
      include: {
        session: true,
        warehouse: true,
        members: true,
      },
    });
    if (!committee) {
      throw new NotFoundException('Warehouse inventory committee not found');
    }
    return committee;
  }

  private async assertWarehouseCommitteeMember(
    user: AuthenticatedUser,
    committee: { members: { employeeId: string }[] },
  ): Promise<void> {
    const actor = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { employeeId: true },
    });
    if (!actor?.employeeId) {
      throw new ForbiddenException('Only committee members can access this committee');
    }
    const isMember = committee.members.some((member) => member.employeeId === actor.employeeId);
    if (!isMember) {
      throw new ForbiddenException('Only committee members can access this committee');
    }
  }

  async recordLine(
    user: AuthenticatedUser,
    committeeId: string,
    equipmentId: string,
    status: InventoryLineStatus,
    note?: string,
    relocation?: {
      relocationTargetType: InventoryRelocationTarget;
      relocationWarehouseId?: string;
      relocationToPersonId?: string;
    },
  ) {
    await this.assertInventoryCountEnabled();
    if (user.role === 'admin') {
      throw new ForbiddenException('Administrator cannot record inventory lines');
    }
    const committee = await this.prisma.inventoryCommittee.findUnique({
      where: { id: committeeId },
      include: { members: true, session: true },
    });
    if (!committee) {
      throw new NotFoundException('Inventory committee not found');
    }
    if (committee.isClosed) {
      throw new BadRequestException('Inventory committee list is closed');
    }
    if (committee.session.status !== 'active') {
      throw new BadRequestException('Session is not active');
    }
    const actor = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { employeeId: true },
    });
    if (!actor?.employeeId) {
      throw new ForbiddenException('Only committee members can record inventory lines');
    }
    const isMember = committee.members.some((member) => member.employeeId === actor.employeeId);
    if (!isMember) {
      throw new ForbiddenException('Only committee members can record inventory lines');
    }
    if (status === 'ostecena' && !note?.trim()) {
      throw new BadRequestException('Note is required for damaged equipment');
    }
    if (status === 'nije_prisutna' && !note?.trim()) {
      throw new BadRequestException('Note is required for missing equipment');
    }
    if (status === 'predlozen_rashod' && !note?.trim()) {
      throw new BadRequestException('Note is required for proposed disposal');
    }
    const equipment = await this.prisma.equipment.findUnique({
      where: { id: equipmentId },
      include: { currentHolder: true, warehouse: true, category: true },
    });
    if (!equipment) {
      throw new NotFoundException('Equipment not found');
    }
    const inScope = await this.isEquipmentInCommitteeScope(committee, equipment);
    if (!inScope) {
      throw new BadRequestException('Equipment is not in inventory committee scope');
    }
    if (status === 'predlozen_rashod') {
      if (equipment.status !== 'skladiste' || !equipment.warehouseId) {
        throw new BadRequestException('Proposed disposal requires equipment on warehouse (razduženo)');
      }
    }
    const line = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.inventoryLine.findUnique({
        where: { committeeId_equipmentId: { committeeId, equipmentId } },
        include: { pendingAction: true },
      });
      if (existing?.pendingAction?.status === 'running' || existing?.pendingAction?.status === 'applied') {
        throw new BadRequestException('Cannot modify inventory line while action is being applied');
      }
      if (status === 'promjena_lokacije') {
        if (!relocation?.relocationTargetType) {
          throw new BadRequestException('Relocation target is required');
        }
        if (relocation.relocationTargetType === 'osoba' && !relocation.relocationToPersonId) {
          throw new BadRequestException('Person is required for relocation');
        }
      }
      const line = await tx.inventoryLine.upsert({
        where: { committeeId_equipmentId: { committeeId, equipmentId } },
        create: {
          committeeId,
          equipmentId,
          status,
          note,
          relocationTargetType: relocation?.relocationTargetType,
          relocationWarehouseId: relocation?.relocationWarehouseId,
          relocationToPersonId: relocation?.relocationToPersonId,
        },
        update: {
          status,
          note,
          relocationTargetType: relocation?.relocationTargetType ?? null,
          relocationWarehouseId: relocation?.relocationWarehouseId ?? null,
          relocationToPersonId: relocation?.relocationToPersonId ?? null,
          generatedTransfer: { disconnect: true },
        },
      });
      const kind =
        status === 'prisutna'
          ? 'mark_present'
          : status === 'ostecena'
            ? 'mark_damaged'
            : status === 'nije_prisutna'
              ? 'mark_missing'
              : status === 'predlozen_rashod'
                ? 'disposal'
                : relocation?.relocationTargetType === 'skladiste'
                  ? 'relocate_to_warehouse'
                  : 'relocate_to_person';
      const payload =
        status === 'promjena_lokacije'
          ? {
              relocationTargetType: relocation?.relocationTargetType,
              relocationToPersonId:
                relocation?.relocationTargetType === 'osoba' ? relocation.relocationToPersonId : null,
              note: note ?? null,
            }
          : { note: note ?? null };
      await tx.inventoryPendingAction.upsert({
        where: { inventoryLineId: line.id },
        create: {
          sessionId: committee.session.id,
          committeeId,
          equipmentId,
          inventoryLineId: line.id,
          kind,
          payload,
          status: 'pending',
          createdByUserId: user.id,
        },
        update: {
          kind,
          payload,
          status: 'pending',
          lastError: null,
          appliedAt: null,
        },
      });
      if (status === 'promjena_lokacije' && relocation) {
        await this.ensureRelocationDraftTransfer(
          committee.session,
          equipment,
          relocation,
          line.id,
          tx,
        );
      }
      return tx.inventoryLine.findUnique({
        where: { id: line.id },
        include: {
          pendingAction: true,
          generatedTransfer: true,
          equipment: { include: { category: true, currentHolder: true } },
        },
      });
    });
    if (line?.generatedTransfer && !line.generatedTransfer.scannedDocUrl) {
      void this.notificationsService.notifyInventoryTransferUploadPending(
        line.generatedTransfer.id,
        committeeId,
      );
    }
    return line;
  }

  async closeCommittee(user: AuthenticatedUser, committeeId: string) {
    await this.assertInventoryCountEnabled();
    if (user.role === 'admin') {
      throw new ForbiddenException('Administrator cannot close inventory committee list');
    }
    const committee = await this.prisma.inventoryCommittee.findUnique({
      where: { id: committeeId },
      include: {
        session: true,
        members: true,
      },
    });
    if (!committee) {
      throw new NotFoundException('Inventory committee not found');
    }
    if (committee.isClosed) {
      return committee;
    }
    if (committee.session.status !== 'active') {
      throw new BadRequestException('Session is not active');
    }
    const actor = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { employeeId: true },
    });
    if (!actor?.employeeId) {
      throw new ForbiddenException('Only committee members can close inventory committee list');
    }
    const member = committee.members.find((row) => row.employeeId === actor.employeeId);
    if (!member || member.role !== 'predsjednik') {
      throw new ForbiddenException('Only committee president can close inventory committee list');
    }
    return this.prisma.inventoryCommittee.update({
      where: { id: committeeId },
      data: { isClosed: true, closedAt: new Date(), closedByUserId: user.id },
      include: { session: true, members: true, category: true },
    });
  }

  async closeSession(user: AuthenticatedUser, sessionId: string) {
    await this.assertInventoryCountEnabled();
    const session = await this.prisma.inventorySession.findUnique({
      where: { id: sessionId },
      include: {
        committees: true,
        closeJobs: true,
      },
    });
    if (!session) {
      throw new NotFoundException('Session not found');
    }
    if (session.status !== 'active') {
      throw new BadRequestException('Only active sessions can be closed');
    }
    const openCommitteeIds = session.committees.filter((committee) => !committee.isClosed).map((c) => c.id);
    if (openCommitteeIds.length > 0) {
      await this.prisma.inventoryCommittee.updateMany({
        where: { id: { in: openCommitteeIds } },
        data: { isClosed: true, closedAt: new Date(), closedByUserId: user.id },
      });
    }
    const existingJob = session.closeJobs[0] ?? null;
    if (existingJob && (existingJob.status === 'queued' || existingJob.status === 'running')) {
      return existingJob;
    }
    await this.assertRelocateLinesHaveUpload(session.id);
    const totalCount = await this.prisma.inventoryPendingAction.count({
      where: { sessionId: session.id, status: 'pending' },
    });
    await this.prisma.inventorySession.update({
      where: { id: session.id },
      data: { status: 'closing' },
    });
    return this.prisma.inventorySessionCloseJob.upsert({
      where: { sessionId: session.id },
      create: {
        sessionId: session.id,
        status: 'queued',
        totalCount,
      },
      update: {
        status: 'queued',
        totalCount,
        appliedCount: 0,
        failedCount: 0,
        skippedCount: 0,
        startedAt: null,
        endedAt: null,
        lastError: null,
      },
    });
  }

  async getCloseJob(sessionId: string) {
    await this.assertInventoryCountEnabled();
    const job = await this.prisma.inventorySessionCloseJob.findUnique({ where: { sessionId } });
    if (!job) {
      return null;
    }
    const remaining = await this.prisma.inventoryPendingAction.count({
      where: { sessionId, status: 'pending' },
    });
    return { ...job, remaining };
  }

  async assertTransfersAllowedForEquipment(equipmentId: string): Promise<void> {
    const equipment = await this.prisma.equipment.findUnique({
      where: { id: equipmentId },
      include: { currentHolder: true, warehouse: true },
    });
    if (!equipment) {
      return;
    }
    const cityId = await this.resolveEquipmentCityId(equipment);
    if (!cityId) {
      return;
    }
    const active = await this.prisma.inventorySession.findFirst({
      where: { status: 'active', orgUnit: { effectiveLocationCityId: cityId } },
    });
    if (active) {
      throw new BadRequestException('Transfers are blocked during active inventory count');
    }
  }

  async assertInventoryTransferFinalizeAllowed(transferId: string): Promise<void> {
    const transfer = await this.prisma.transfer.findUnique({
      where: { id: transferId },
      select: {
        inventoryLine: {
          select: { committee: { select: { session: { select: { status: true } } } } },
        },
      },
    });
    const sessionStatus = transfer?.inventoryLine?.committee?.session?.status;
    if (sessionStatus === 'active') {
      throw new BadRequestException(
        'Inventory transfer cannot be finalized while inventory session is active',
      );
    }
  }

  async applyPendingAction(pendingActionId: string): Promise<void> {
    const action = await this.prisma.inventoryPendingAction.findUnique({
      where: { id: pendingActionId },
      include: {
        session: true,
        inventoryLine: true,
      },
    });
    if (!action) {
      throw new NotFoundException('Pending action not found');
    }
    if (action.kind === 'mark_present' || action.kind === 'mark_damaged' || action.kind === 'mark_missing') {
      return;
    }
    const committee = await this.prisma.inventoryCommittee.findUnique({
      where: { id: action.committeeId },
      select: {
        id: true,
        disposalCommissionId: true,
        session: true,
      },
    });
    if (!committee) {
      throw new NotFoundException('Inventory committee not found');
    }
    const equipment = await this.prisma.equipment.findUnique({
      where: { id: action.equipmentId },
      include: { currentHolder: true, warehouse: true },
    });
    if (!equipment) {
      throw new NotFoundException('Equipment not found');
    }
    const payload = action.payload as { relocationToPersonId?: string | null };
    if (action.kind === 'relocate_to_warehouse' || action.kind === 'relocate_to_person') {
      const actorUserId = await this.resolveCloseJobActorUserId();
      const line = action.inventoryLineId
        ? await this.prisma.inventoryLine.findUnique({
            where: { id: action.inventoryLineId },
            include: { generatedTransfer: true },
          })
        : null;
      let transferId = line?.generatedTransfer?.id ?? null;
      if (!transferId) {
        if (action.kind === 'relocate_to_warehouse') {
          const created = await this.createRelocationTransfer(
            committee.session,
            equipment,
            'skladiste',
            undefined,
            undefined,
            action.inventoryLineId,
          );
          transferId = created.id;
        } else {
          const toPersonId = payload.relocationToPersonId ?? null;
          if (!toPersonId) {
            throw new BadRequestException('Target person is required');
          }
          const created = await this.createRelocationTransfer(
            committee.session,
            equipment,
            'osoba',
            undefined,
            toPersonId,
            action.inventoryLineId,
          );
          transferId = created.id;
        }
      }
      await this.prisma.$transaction(async (tx) => {
        await finalizeInventoryTransferInTx(tx, transferId!, actorUserId);
      });
      return;
    }
    if (action.kind === 'disposal') {
      await this.applyDisposalPendingAction(committee, action);
      return;
    }
  }

  async getSessionReport(sessionId: string) {
    await this.assertInventoryCountEnabled();
    const session = await this.prisma.inventorySession.findUnique({
      where: { id: sessionId },
      include: {
        orgUnit: true,
        committees: {
          include: {
            category: true,
            lines: {
              include: {
                pendingAction: true,
                equipment: { include: { category: true, currentHolder: true, warehouse: true } },
              },
            },
          },
        },
        disposalApprovals: {
          include: { equipment: true, disposalCommission: true },
        },
      },
    });
    if (!session) {
      throw new NotFoundException('Inventory session not found');
    }
    return session;
  }

  async getDisposalReport(sessionId: string) {
    await this.assertInventoryCountEnabled();
    const session = await this.prisma.inventorySession.findUnique({
      where: { id: sessionId },
      include: { orgUnit: true },
    });
    if (!session) {
      throw new NotFoundException('Inventory session not found');
    }
    const approvals = await this.prisma.disposalInventoryApproval.findMany({
      where: { sessionId },
      include: {
        equipment: { include: { category: true, warehouse: true } },
        disposalCommission: {
          include: {
            city: true,
            inventoryCommittee: { include: { category: true } },
            members: { include: { employee: true } },
          },
        },
        inventoryLine: true,
        reviewedByUser: { select: { username: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return buildDisposalReportPayload(session, approvals);
  }

  async getDisposalInboxForUser(user: AuthenticatedUser, sessionId: string) {
    await this.assertInventoryCountEnabled();
    const actor = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { employeeId: true },
    });
    if (!actor?.employeeId && user.role !== 'admin') {
      return [];
    }
    const approvals = await this.prisma.disposalInventoryApproval.findMany({
      where: { sessionId, status: 'pending' },
      include: {
        equipment: { include: { category: true, warehouse: true } },
        disposalCommission: { include: { members: true } },
        inventoryLine: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    if (user.role === 'admin') {
      return approvals;
    }
    return approvals.filter((row) => {
      const president = row.disposalCommission.members.find((m) => m.role === 'predsjednik');
      return president?.employeeId === actor!.employeeId;
    });
  }

  async reviewDisposalApproval(
    user: AuthenticatedUser,
    approvalId: string,
    approved: boolean,
    note?: string,
  ) {
    await this.assertInventoryCountEnabled();
    const approval = await this.prisma.disposalInventoryApproval.findUnique({
      where: { id: approvalId },
      include: {
        equipment: true,
        disposalCommission: { include: { members: true } },
      },
    });
    if (!approval) {
      throw new NotFoundException('Disposal approval not found');
    }
    if (approval.status !== 'pending') {
      throw new BadRequestException('Approval already reviewed');
    }
    const actor = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { employeeId: true, role: true },
    });
    const president = approval.disposalCommission.members.find((m) => m.role === 'predsjednik');
    const isPresident = president?.employeeId === actor?.employeeId;
    if (user.role !== 'admin' && !isPresident) {
      throw new ForbiddenException('Only disposal commission president can review');
    }
    if (!approved && !note?.trim()) {
      throw new BadRequestException('Rejection reason is required');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.disposalInventoryApproval.update({
        where: { id: approvalId },
        data: {
          status: approved ? 'approved' : 'rejected',
          reviewedByUserId: user.id,
          reviewNote: note?.trim() ?? null,
          reviewedAt: new Date(),
        },
        include: { equipment: true },
      });
      if (approved) {
        await tx.equipment.update({
          where: { id: approval.equipmentId },
          data: {
            status: 'rashodovano',
            currentHolderId: null,
            warehouseId: approval.equipment.warehouseId,
            warehouseCondition: 'unisteno',
          },
        });
        await tx.equipmentDisposalListItem.updateMany({
          where: { approvalId: approval.id },
          data: { status: 'approved' },
        });
      } else {
        await tx.equipmentDisposalListItem.updateMany({
          where: { approvalId: approval.id },
          data: { status: 'rejected' },
        });
        await tx.equipment.update({
          where: { id: approval.equipmentId },
          data: { status: 'skladiste' },
        });
      }
      return row;
    });
    void this.notificationsService.emitInventoryDisposalInboxRefresh(approval.sessionId);
    return updated;
  }

  private async applyDisposalPendingAction(
    committee: { id: string; disposalCommissionId: string | null; session: { id: string } },
    action: { equipmentId: string; inventoryLineId: string | null },
  ): Promise<void> {
    if (!committee.disposalCommissionId) {
      throw new BadRequestException('Disposal commission is not configured for committee');
    }
    const approval = await this.prisma.disposalInventoryApproval.upsert({
      where: {
        equipmentId_disposalCommissionId: {
          equipmentId: action.equipmentId,
          disposalCommissionId: committee.disposalCommissionId,
        },
      },
      create: {
        equipmentId: action.equipmentId,
        disposalCommissionId: committee.disposalCommissionId,
        sessionId: committee.session.id,
        inventoryLineId: action.inventoryLineId,
        status: 'pending',
      },
      update: {
        status: 'pending',
        inventoryLineId: action.inventoryLineId,
        reviewedByUserId: null,
        reviewNote: null,
        reviewedAt: null,
      },
      include: { equipment: { select: { inventoryNumber: true } } },
    });
    void this.notificationsService.notifyDisposalApprovalPending(
      approval.id,
      committee.disposalCommissionId,
      approval.equipment.inventoryNumber,
    );
    void this.notificationsService.emitInventoryDisposalInboxRefresh(committee.session.id);
  }

  private async assertRelocateLinesHaveUpload(sessionId: string): Promise<void> {
    const lines = await this.prisma.inventoryLine.findMany({
      where: { committee: { sessionId }, status: 'promjena_lokacije' },
      include: { generatedTransfer: true, equipment: { select: { inventoryNumber: true } } },
    });
    const missing = lines.filter((line) => !line.generatedTransfer?.scannedDocUrl);
    if (missing.length > 0) {
      const numbers = missing.map((line) => line.equipment.inventoryNumber).join(', ');
      throw new BadRequestException(
        `Prenosnice za promjenu lokacije moraju imati upload prije zatvaranja sesije: ${numbers}`,
      );
    }
  }

  private async resolveCloseJobActorUserId(): Promise<string> {
    return this.resolveSystemActorUserId();
  }

  private async resolveSystemActorUserId(): Promise<string> {
    const setting = await this.prisma.setting.findUnique({
      where: { key: 'inventory.system_user_id' },
    });
    const configuredId = setting?.value?.trim();
    if (configuredId) {
      const configured = await this.prisma.user.findFirst({
        where: { id: configuredId, isActive: true, role: 'admin' },
        select: { id: true },
      });
      if (configured) {
        return configured.id;
      }
    }
    const admin = await this.prisma.user.findFirst({
      where: { role: 'admin', isActive: true },
      select: { id: true },
    });
    if (!admin) {
      throw new BadRequestException('No admin user available for inventory close job');
    }
    return admin.id;
  }

  async resolveSystemActorUser(): Promise<AuthenticatedUser> {
    const userId = await this.resolveSystemActorUserId();
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { registrarAssignments: true, inventoryCoordinatorAssignments: true },
    });
    if (!user) {
      throw new BadRequestException('System actor user not found');
    }
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      employeeId: user.employeeId,
      registrarScopes: user.registrarAssignments.map((row) => ({
        warehouseId: row.warehouseId,
        categoryId: row.categoryId,
        orgUnitId: row.orgUnitId,
      })),
      coordinatorAssignments: user.inventoryCoordinatorAssignments.map((row) => ({
        warehouseId: row.warehouseId,
        orgUnitId: row.orgUnitId,
      })),
    };
  }

  private async ensureRelocationDraftTransfer(
    session: { year: number; orgUnitId: string },
    equipment: {
      id: string;
      status: string;
      warehouseId: string | null;
      currentHolderId: string | null;
      currentHolder: { id: string; orgUnitId: string } | null;
    },
    relocation: {
      relocationTargetType: InventoryRelocationTarget;
      relocationWarehouseId?: string;
      relocationToPersonId?: string;
    },
    inventoryLineId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const existing = await tx.transfer.findFirst({
      where: { inventoryLineId },
      select: { id: true },
    });
    if (existing) {
      return;
    }
    if (relocation.relocationTargetType === 'skladiste') {
      await this.createRelocationTransfer(
        session,
        equipment,
        'skladiste',
        relocation.relocationWarehouseId,
        undefined,
        inventoryLineId,
        tx,
      );
      return;
    }
    await this.createRelocationTransfer(
      session,
      equipment,
      'osoba',
      undefined,
      relocation.relocationToPersonId,
      inventoryLineId,
      tx,
    );
  }

  private async validateCommitteeMembers(
    members: CommitteeMemberInput[],
    options: { requireUserForPresidentOnly: boolean },
  ): Promise<void> {
    const presidents = members.filter((row) => row.role === 'predsjednik');
    const clerks = members.filter((row) => row.role === 'clan');
    if (presidents.length !== 1) {
      throw new BadRequestException('Exactly one committee president is required');
    }
    if (clerks.length < 2 || members.length < 3) {
      throw new BadRequestException('At least two committee members besides president are required');
    }
    const employeeIds = new Set(members.map((row) => row.employeeId));
    if (employeeIds.size !== members.length) {
      throw new BadRequestException('Duplicate committee members');
    }
    const employees = await this.prisma.employee.findMany({
      where: { id: { in: [...employeeIds] } },
      select: { id: true },
    });
    if (employees.length !== employeeIds.size) {
      throw new BadRequestException('Invalid employee in committee');
    }
    if (!options.requireUserForPresidentOnly) {
      const activeUsers = await this.prisma.user.findMany({
        where: { employeeId: { in: [...employeeIds] }, isActive: true },
        select: { employeeId: true },
      });
      const userEmployeeIds = new Set(activeUsers.map((row) => row.employeeId).filter(Boolean) as string[]);
      for (const employeeId of employeeIds) {
        if (!userEmployeeIds.has(employeeId)) {
          throw new BadRequestException('All committee members must have active user accounts');
        }
      }
      return;
    }
    const presidentUser = await this.prisma.user.findFirst({
      where: { employeeId: presidents[0].employeeId, isActive: true },
    });
    if (!presidentUser) {
      throw new BadRequestException('President must have an active user account');
    }
  }

  private async isEquipmentInCommitteeScope(
    committee: {
      categoryId: string;
      warehouseId: string | null;
      session: { orgUnitId: string };
    },
    equipment: {
      id: string;
      categoryId: string;
      status: string;
      currentHolder: { orgUnitId: string } | null;
      warehouse?: { cityId: string } | null;
      warehouseId?: string | null;
      category?: { categoryKind: 'ASSET' | 'MAINTENANCE' } | null;
    },
  ): Promise<boolean> {
    const deps = this.buildCommitteeScopeDeps();
    return evaluateEquipmentInCommitteeScope(
      deps,
      {
        categoryId: committee.categoryId,
        warehouseId: committee.warehouseId,
        sessionOrgUnitId: committee.session.orgUnitId,
      },
      equipment as WarehouseScopeEquipment,
    );
  }

  private buildCommitteeScopeDeps(): CommitteeScopeDeps {
    return {
      expandCategoryIds: (categoryIds) => this.registrarScope.expandCategoryIds(categoryIds),
      resolveEquipmentCityId: (equipment) => this.resolveEquipmentCityId(equipment),
      getEffectiveLocationForOrgUnit: (orgUnitId) =>
        this.locationResolutionService.getEffectiveLocationForOrgUnit(orgUnitId),
      getWarehouseCityId: async (warehouseId) => {
        const row = await this.prisma.warehouse.findUnique({
          where: { id: warehouseId },
          select: { cityId: true },
        });
        return row?.cityId ?? null;
      },
      expandOrgUnitIds: (rootIds) => this.orgScopeService.expandOrgUnitIds(rootIds),
      getWarehouseOrgUnitId: async (warehouseId) => {
        const row = await this.prisma.warehouse.findUnique({
          where: { id: warehouseId },
          select: { orgUnitId: true },
        });
        return row?.orgUnitId ?? null;
      },
    };
  }

  private async loadCandidateEquipmentForWarehouse(warehouse: {
    id: string;
    cityId: string;
    orgUnitId: string | null;
  }): Promise<WarehouseScopeEquipment[]> {
    const coverageOrgUnitIds = warehouse.orgUnitId
      ? await this.orgScopeService.expandOrgUnitIds([warehouse.orgUnitId])
      : [];
    const orConditions: Prisma.EquipmentWhereInput[] = [
      { warehouseId: warehouse.id, status: 'skladiste' },
    ];
    if (coverageOrgUnitIds.length > 0) {
      orConditions.push({
        status: 'zaduzeno',
        currentHolder: { orgUnitId: { in: coverageOrgUnitIds } },
      });
    }
    return this.prisma.equipment.findMany({
      where: {
        status: INVENTORY_COUNTABLE_EQUIPMENT_STATUS,
        category: { categoryKind: 'ASSET' },
        OR: orConditions,
      },
      include: {
        category: true,
        currentHolder: true,
        warehouse: true,
      },
    });
  }

  private async loadCandidateEquipmentForSessionCity(sessionCityId: string): Promise<WarehouseScopeEquipment[]> {
    const warehousesInCity = await this.prisma.warehouse.findMany({
      where: { cityId: sessionCityId },
      select: { id: true },
    });
    const warehouseIds = warehousesInCity.map((row) => row.id);
    const orgUnitsInCity = await this.prisma.orgUnit.findMany({
      where: { effectiveLocationCityId: sessionCityId },
      select: { id: true },
    });
    const orgUnitIds = orgUnitsInCity.map((row) => row.id);
    return this.prisma.equipment.findMany({
      where: {
        status: INVENTORY_COUNTABLE_EQUIPMENT_STATUS,
        category: { categoryKind: 'ASSET' },
        OR: [
          { warehouseId: { in: warehouseIds } },
          { currentHolder: { orgUnitId: { in: orgUnitIds } } },
        ],
      },
      include: {
        category: true,
        currentHolder: true,
        warehouse: true,
      },
    });
  }

  private async resolveEligibleEmployeesForWarehouse(warehouse: {
    id: string;
    cityId: string;
    orgUnitId: string | null;
  }) {
    const assignments = await this.prisma.registrarAssignment.findMany({
      where: { warehouseId: warehouse.id },
      select: { userId: true },
    });
    const assignmentUserIds = new Set(assignments.map((row) => row.userId));
    const employees = await this.prisma.employee.findMany({
      include: { user: { select: { id: true, isActive: true } } },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    const eligible: {
      id: string;
      firstName: string;
      lastName: string;
      title: string;
      hasUserAccount: boolean;
    }[] = [];
    for (const employee of employees) {
      const employeeCityId = await this.locationResolutionService.getEffectiveLocationForOrgUnit(
        employee.orgUnitId,
      );
      if (employeeCityId !== warehouse.cityId) {
        continue;
      }
      const inCoverage = await isEmployeeInWarehouseCoverage(
        (rootIds) => this.orgScopeService.expandOrgUnitIds(rootIds),
        warehouse.orgUnitId,
        employee.orgUnitId,
      );
      const hasAssignment = employee.user ? assignmentUserIds.has(employee.user.id) : false;
      if (!inCoverage && !hasAssignment) {
        continue;
      }
      eligible.push({
        id: employee.id,
        firstName: employee.firstName,
        lastName: employee.lastName,
        title: employee.title,
        hasUserAccount: Boolean(employee.user?.isActive),
      });
    }
    return eligible;
  }

  private async assertMembersEligibleForWarehouse(
    warehouseId: string,
    employeeIds: string[],
  ): Promise<void> {
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: warehouseId },
      select: { id: true, cityId: true, orgUnitId: true },
    });
    if (!warehouse) {
      throw new BadRequestException('Warehouse not found');
    }
    const eligible = await this.resolveEligibleEmployeesForWarehouse(warehouse);
    const eligibleIds = new Set(eligible.map((row) => row.id));
    for (const employeeId of employeeIds) {
      if (!eligibleIds.has(employeeId)) {
        throw new BadRequestException('Committee member is not eligible for the selected warehouse');
      }
    }
  }

  private async createRelocationTransfer(
    session: { year: number; orgUnitId: string },
    equipment: {
      id: string;
      status: string;
      warehouseId: string | null;
      currentHolderId: string | null;
      currentHolder: { id: string; orgUnitId: string } | null;
    },
    targetType: InventoryRelocationTarget,
    warehouseId?: string,
    toPersonId?: string,
    inventoryLineId?: string,
    tx?: Pick<PrismaService, 'transfer' | 'employee'>,
  ) {
    const db = tx ?? this.prisma;
    const sessionCityId = await this.locationResolutionService.getEffectiveLocationForOrgUnit(
      session.orgUnitId,
    );
    if (!sessionCityId) {
      throw new BadRequestException('Session distribution must have effective location city configured');
    }
    const signerId = equipment.currentHolderId ?? (await this.getDefaultSignerId());
    if (targetType === 'skladiste') {
      await assertTransferCreationAllowed(this.settingsService, 'razduzenje', 'inventory');
      const resolvedWarehouseId = await this.resolveRelocationWarehouseId({
        sessionCityId,
        sessionOrgUnitId: session.orgUnitId,
        requestedWarehouseId: warehouseId,
      });
      if (equipment.status === 'zaduzeno' && equipment.currentHolderId) {
        const documentWarehouseId = resolveDocumentWarehouseId({
          type: 'razduzenje',
          fromWarehouseId: null,
          toWarehouseId: resolvedWarehouseId,
          equipmentWarehouseId: equipment.warehouseId,
        });
        return db.transfer.create({
          data: {
            equipmentId: equipment.id,
            type: 'razduzenje',
            fromType: 'osoba',
            fromPersonId: equipment.currentHolderId,
            toType: 'skladiste',
            toWarehouseId: resolvedWarehouseId,
            documentWarehouseId,
            signerId,
            toPersonId: null,
            date: new Date(),
            status: 'raw',
            documentNumber: `DRAFT-POPIS-${Date.now()}`,
            notes: `Automatski prenos iz popisa (${session.year}) — na skladište`,
            ...(inventoryLineId ? { inventoryLineId } : {}),
          },
        });
      }
      throw new BadRequestException('Equipment is already in warehouse or cannot relocate to warehouse');
    }
    if (!toPersonId) {
      throw new BadRequestException('Person is required for relocation');
    }
    const toEmployee = await db.employee.findUnique({ where: { id: toPersonId } });
    if (!toEmployee) {
      throw new BadRequestException('Target person not found');
    }
    const toCityId = await this.locationResolutionService.getEffectiveLocationForOrgUnit(
      toEmployee.orgUnitId,
    );
    if (toCityId !== sessionCityId) {
      throw new BadRequestException('Target person must be in session city');
    }
    if (equipment.status === 'skladiste') {
      await assertTransferCreationAllowed(this.settingsService, 'zaduzenje', 'inventory');
      const fromWarehouseId = await this.resolveRelocationWarehouseId({
        sessionCityId,
        sessionOrgUnitId: session.orgUnitId,
      });
      const documentWarehouseId = resolveDocumentWarehouseId({
        type: 'zaduzenje',
        fromWarehouseId,
        toWarehouseId: null,
        equipmentWarehouseId: equipment.warehouseId,
      });
      return db.transfer.create({
        data: {
          equipmentId: equipment.id,
          type: 'zaduzenje',
          fromType: 'skladiste',
          fromWarehouseId,
          documentWarehouseId,
          toType: 'osoba',
          toPersonId,
          signerId: toPersonId,
          date: new Date(),
          status: 'raw',
          documentNumber: `DRAFT-POPIS-${Date.now()}`,
          notes: `Automatski prenos iz popisa (${session.year}) — zaduženje`,
          ...(inventoryLineId ? { inventoryLineId } : {}),
        },
      });
    }
    if (equipment.status === 'zaduzeno' && equipment.currentHolderId) {
      await assertTransferCreationAllowed(this.settingsService, 'prenos', 'inventory');
      const holderWarehouseId = await this.warehouseResolutionService.resolveForEmployee(
        equipment.currentHolderId,
      );
      const documentWarehouseId = resolveDocumentWarehouseId({
        type: 'prenos',
        fromWarehouseId: null,
        toWarehouseId: null,
        equipmentWarehouseId: equipment.warehouseId,
        resolvedHolderWarehouseId: holderWarehouseId,
      });
      return db.transfer.create({
        data: {
          equipmentId: equipment.id,
          type: 'prenos',
          fromType: 'osoba',
          fromPersonId: equipment.currentHolderId,
          toType: 'osoba',
          toPersonId,
          documentWarehouseId,
          signerId: toPersonId,
          date: new Date(),
          status: 'raw',
          documentNumber: `DRAFT-POPIS-${Date.now()}`,
          notes: `Automatski prenos iz popisa (${session.year}) — prenos`,
          ...(inventoryLineId ? { inventoryLineId } : {}),
        },
      });
    }
    throw new BadRequestException('Cannot relocate equipment to person');
  }

  private async getSessionOrThrow(sessionId: string) {
    const session = await this.prisma.inventorySession.findUnique({ where: { id: sessionId } });
    if (!session) {
      throw new NotFoundException('Inventory session not found');
    }
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

  private async getDefaultSignerId(): Promise<string> {
    const employee = await this.prisma.employee.findFirst();
    if (!employee) {
      throw new BadRequestException('No signer employee configured');
    }
    return employee.id;
  }

  private async resolveRelocationWarehouseId(input: {
    sessionCityId: string;
    sessionOrgUnitId: string;
    requestedWarehouseId?: string;
  }): Promise<string> {
    if (input.requestedWarehouseId) {
      const warehouse = await this.prisma.warehouse.findUnique({
        where: { id: input.requestedWarehouseId },
        select: { id: true, cityId: true },
      });
      if (!warehouse || warehouse.cityId !== input.sessionCityId) {
        throw new BadRequestException('Warehouse must be in session city');
      }
      return warehouse.id;
    }
    const resolved = await this.warehouseResolutionService.resolveForOrgUnit(
      input.sessionOrgUnitId,
      input.sessionCityId,
    );
    if (resolved) {
      return resolved;
    }
    throw new BadRequestException('No active warehouse configured for session city');
  }
}
