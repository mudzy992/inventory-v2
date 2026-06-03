import { Injectable } from '@nestjs/common';
import { resolveEffectiveWarehouseId } from '../utils/resolve-effective-warehouse.util';
import { LocationResolutionService } from './location-resolution.service';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class WarehouseResolutionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly locationResolutionService: LocationResolutionService,
  ) {}

  async resolveForOrgUnit(orgUnitId: string, cityId?: string | null): Promise<string | null> {
    const [orgUnits, warehouses] = await Promise.all([
      this.prisma.orgUnit.findMany({ select: { id: true, parentId: true } }),
      this.prisma.warehouse.findMany({
        select: { id: true, orgUnitId: true, cityId: true, isActive: true, createdAt: true },
      }),
    ]);
    const effectiveCityId =
      cityId ?? (await this.locationResolutionService.getEffectiveLocationForOrgUnit(orgUnitId));
    return resolveEffectiveWarehouseId(orgUnitId, orgUnits, warehouses, effectiveCityId);
  }

  async resolveForEmployee(employeeId: string): Promise<string | null> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { orgUnitId: true },
    });
    if (!employee) {
      return null;
    }
    return this.resolveForOrgUnit(employee.orgUnitId);
  }
}
