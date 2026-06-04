import { Injectable } from '@nestjs/common';
import { applyEffectiveOrgUnitUpdates } from '../utils/apply-effective-org-updates.util';
import {
  collectAllOrgUnitIds,
  collectOpenSubtreeIds,
} from '../utils/collect-open-org-subtree.util';
import { resolveEffectiveLocationCityId } from '../utils/resolve-effective-location.util';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class LocationResolutionService {
  constructor(private readonly prisma: PrismaService) {}

  async refreshOrgUnitEffectiveLocations(orgUnitId?: string): Promise<void> {
    const units = await this.prisma.orgUnit.findMany({
      select: {
        id: true,
        parentId: true,
        locationCityId: true,
        effectiveLocationCityId: true,
      },
    });
    const targetIds = orgUnitId
      ? collectOpenSubtreeIds(orgUnitId, units, 'locationCityId')
      : collectAllOrgUnitIds(units);
    const byId = new Map(units.map((unit) => [unit.id, unit]));
    const updates = targetIds
      .map((id) => {
        const nextValue = resolveEffectiveLocationCityId(id, units);
        const current = byId.get(id)?.effectiveLocationCityId ?? null;
        if (nextValue === current) {
          return null;
        }
        return { id, nextValue };
      })
      .filter((row): row is { id: string; nextValue: string | null } => row !== null);
    await applyEffectiveOrgUnitUpdates(this.prisma, 'effectiveLocationCityId', updates);
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
}
