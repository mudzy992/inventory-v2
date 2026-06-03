import { BadRequestException, Injectable } from '@nestjs/common';
import {
  buildEffectiveSignerMap,
  resolveEffectiveSignerId,
} from '../utils/resolve-effective-signer.util';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SignerResolutionService {
  constructor(private readonly prisma: PrismaService) {}

  async refreshOrgUnitEffectiveSigners(orgUnitId?: string): Promise<void> {
    const units = await this.prisma.orgUnit.findMany({
      select: { id: true, parentId: true, signerId: true },
    });
    const effectiveMap = buildEffectiveSignerMap(units);
    const targets = orgUnitId
      ? units.filter((unit) => unit.id === orgUnitId || this.isDescendant(orgUnitId, unit.id, units))
      : units;
    for (const unit of targets) {
      const effectiveSignerId = effectiveMap.get(unit.id) ?? null;
      await this.prisma.orgUnit.update({
        where: { id: unit.id },
        data: { effectiveSignerId },
      });
    }
  }

  async getEffectiveSignerForOrgUnit(orgUnitId: string): Promise<string | null> {
    const unit = await this.prisma.orgUnit.findUnique({
      where: { id: orgUnitId },
      select: { effectiveSignerId: true },
    });
    if (unit?.effectiveSignerId) {
      return unit.effectiveSignerId;
    }
    const units = await this.prisma.orgUnit.findMany({
      select: { id: true, parentId: true, signerId: true },
    });
    return resolveEffectiveSignerId(orgUnitId, units);
  }

  async getEffectiveSignerForEmployee(employeeId: string): Promise<string | null> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { orgUnitId: true },
    });
    if (!employee) {
      return null;
    }
    return this.getEffectiveSignerForOrgUnit(employee.orgUnitId);
  }

  assertEffectiveSignerConfigured(effectiveSignerId: string | null): string {
    if (!effectiveSignerId) {
      throw new BadRequestException('No signer configured in org hierarchy');
    }
    return effectiveSignerId;
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
