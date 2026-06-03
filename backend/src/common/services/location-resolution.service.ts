import { Injectable } from '@nestjs/common';
import {
  buildEffectiveLocationMap,
  resolveEffectiveLocationCityId,
} from '../utils/resolve-effective-location.util';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class LocationResolutionService {
  constructor(private readonly prisma: PrismaService) {}

  async refreshOrgUnitEffectiveLocations(orgUnitId?: string): Promise<void> {
    const units = await this.prisma.orgUnit.findMany({
      select: { id: true, parentId: true, locationCityId: true },
    });
    const effectiveMap = buildEffectiveLocationMap(units);
    const targets = orgUnitId
      ? units.filter((unit) => unit.id === orgUnitId || this.isDescendant(orgUnitId, unit.id, units))
      : units;
    for (const unit of targets) {
      const effectiveLocationCityId = effectiveMap.get(unit.id) ?? null;
      await this.prisma.orgUnit.update({
        where: { id: unit.id },
        data: { effectiveLocationCityId },
      });
    }
  }

  async getEffectiveLocationForOrgUnit(orgUnitId: string): Promise<string | null> {
    const unit = await this.prisma.orgUnit.findUnique({
      where: { id: orgUnitId },
      select: { effectiveLocationCityId: true },
    });
    if (unit?.effectiveLocationCityId) {
      return unit.effectiveLocationCityId;
    }
    const units = await this.prisma.orgUnit.findMany({
      select: { id: true, parentId: true, locationCityId: true },
    });
    return resolveEffectiveLocationCityId(orgUnitId, units);
  }

  async getEffectiveLocationForEmployee(employeeId: string): Promise<string | null> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { orgUnitId: true },
    });
    if (!employee) {
      return null;
    }
    return this.getEffectiveLocationForOrgUnit(employee.orgUnitId);
  }

  private isDescendant(
    ancestorId: string,
    unitId: string,
    units: { id: string; parentId: string | null }[],
  ): boolean {
    const byId = new Map(units.map((unit) => [unit.id, unit]));
    let currentId: string | null = unitId;
    while (currentId) {
      if (currentId === ancestorId) {
        return true;
      }
      currentId = byId.get(currentId)?.parentId ?? null;
    }
    return false;
  }
}
