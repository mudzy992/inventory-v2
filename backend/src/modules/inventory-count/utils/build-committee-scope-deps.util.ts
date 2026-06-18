import type { LocationResolutionService } from '../../../common/services/location-resolution.service';
import type { OrgScopeService } from '../../../common/services/org-scope.service';
import type { RegistrarScopeService } from '../../../common/services/registrar-scope.service';
import type { WarehouseResolutionService } from '../../../common/services/warehouse-resolution.service';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { CommitteeScopeDeps } from './resolve-warehouse-committee-scope.util';

export const buildCommitteeScopeDeps = (
  prisma: PrismaService,
  locationResolutionService: LocationResolutionService,
  registrarScope: RegistrarScopeService,
  orgScopeService: OrgScopeService,
  warehouseResolutionService: WarehouseResolutionService,
  resolveEquipmentCityId: CommitteeScopeDeps['resolveEquipmentCityId'],
): CommitteeScopeDeps => ({
  expandCategoryIds: (categoryIds) => registrarScope.expandCategoryIds(categoryIds),
  resolveEquipmentCityId,
  getEffectiveLocationForOrgUnit: (orgUnitId) =>
    locationResolutionService.getEffectiveLocationForOrgUnit(orgUnitId),
  getWarehouseCityId: async (warehouseId) => {
    const row = await prisma.warehouse.findUnique({
      where: { id: warehouseId },
      select: { cityId: true },
    });
    return row?.cityId ?? null;
  },
  expandOrgUnitIds: (rootIds) => orgScopeService.expandOrgUnitIds(rootIds),
  getWarehouseOrgUnitId: async (warehouseId) => {
    const row = await prisma.warehouse.findUnique({
      where: { id: warehouseId },
      select: { orgUnitId: true },
    });
    return row?.orgUnitId ?? null;
  },
  resolveEmployeeWarehouseId: (employeeId) =>
    warehouseResolutionService.resolveForEmployee(employeeId),
});
