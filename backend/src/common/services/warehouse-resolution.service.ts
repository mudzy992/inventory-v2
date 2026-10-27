import { Injectable } from '@nestjs/common';
import { collectOrgUnitIdsForEffectiveWarehouse } from '../utils/collect-org-units-for-warehouse.util';
import { buildEffectiveLocationMap } from '../utils/resolve-effective-location.util';
import {
  resolveEffectiveWarehouseId,
  type OrgUnitWarehouseRow,
  type WarehouseRow,
} from '../utils/resolve-effective-warehouse.util';
import { getScopeCacheVersion, isScopeCacheStale } from './scope-cache.registry';
import { LocationResolutionService } from './location-resolution.service';
import { PrismaService } from '../../prisma/prisma.service';

interface OrgUnitNode extends OrgUnitWarehouseRow {
  locationCityId: string | null;
  effectiveLocationCityId: string | null;
}

interface WarehouseGraph {
  orgUnits: OrgUnitNode[];
  warehouses: WarehouseRow[];
  effectiveCityByOrgUnit: Map<string, string | null>;
}

/**
 * N-5: the org-unit/warehouse graph used to be re-read from PostgreSQL on
 * EVERY call (two unbounded findMany calls), and callers that needed to match
 * a whole warehouse iterated all employees calling resolveForEmployee() —
 * O(employees × (orgUnits + warehouses)). The graph is now cached with the
 * same TTL/version contract as the authorization scope caches, and the
 * employee lookup is a single bounded query.
 */
@Injectable()
export class WarehouseResolutionService {
  private graph: WarehouseGraph | null = null;
  private graphLoadedAt = 0;
  private graphVersion = -1;

  constructor(
    private readonly prisma: PrismaService,
    private readonly locationResolutionService: LocationResolutionService,
  ) {}

  private refreshGraphIfStale(): void {
    if (!isScopeCacheStale(this.graphLoadedAt, this.graphVersion)) return;
    this.graph = null;
    this.graphLoadedAt = Date.now();
    this.graphVersion = getScopeCacheVersion();
  }

  /** One bounded load per TTL/version, shared by all callers in this process. */
  async getWarehouseGraph(): Promise<WarehouseGraph> {
    this.refreshGraphIfStale();
    if (this.graph) return this.graph;
    const [orgUnits, warehouses] = await Promise.all([
      this.prisma.orgUnit.findMany({
        select: {
          id: true,
          parentId: true,
          locationCityId: true,
          effectiveLocationCityId: true,
        },
      }),
      this.prisma.warehouse.findMany({
        select: { id: true, orgUnitId: true, cityId: true, isActive: true, createdAt: true },
      }),
    ]);
    const fallbackCities = buildEffectiveLocationMap(orgUnits);
    const effectiveCityByOrgUnit = new Map<string, string | null>();
    for (const unit of orgUnits) {
      effectiveCityByOrgUnit.set(
        unit.id,
        unit.effectiveLocationCityId ?? fallbackCities.get(unit.id) ?? null,
      );
    }
    this.graph = { orgUnits, warehouses, effectiveCityByOrgUnit };
    return this.graph;
  }

  async resolveForOrgUnit(orgUnitId: string, cityId?: string | null): Promise<string | null> {
    const { orgUnits, warehouses, effectiveCityByOrgUnit } = await this.getWarehouseGraph();
    const effectiveCityId =
      cityId ??
      effectiveCityByOrgUnit.get(orgUnitId) ??
      (await this.locationResolutionService.getEffectiveLocationForOrgUnit(orgUnitId));
    return resolveEffectiveWarehouseId(orgUnitId, orgUnits, warehouses, effectiveCityId);
  }

  async resolveForEmployee(employeeId: string): Promise<string | null> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { orgUnitId: true },
    });
    if (!employee) return null;
    return this.resolveForOrgUnit(employee.orgUnitId);
  }

  /**
   * Single bounded employee query for a whole warehouse — replaces the old
   * per-employee resolveForEmployee() loop in InventoryCountService.
   */
  async findEmployeeIdsForWarehouse(warehouseId: string): Promise<string[]> {
    const { orgUnits, warehouses, effectiveCityByOrgUnit } = await this.getWarehouseGraph();
    const orgUnitIds = collectOrgUnitIdsForEffectiveWarehouse(
      warehouseId,
      orgUnits,
      warehouses,
      (orgUnitId) => effectiveCityByOrgUnit.get(orgUnitId) ?? null,
    );
    if (orgUnitIds.size === 0) return [];
    const employees = await this.prisma.employee.findMany({
      where: { orgUnitId: { in: [...orgUnitIds] } },
      select: { id: true },
      take: 10_000,
    });
    return employees.map((employee) => employee.id);
  }
}
