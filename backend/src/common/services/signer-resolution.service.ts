import { BadRequestException, Injectable } from '@nestjs/common';
import { applyEffectiveOrgUnitUpdates } from '../utils/apply-effective-org-updates.util';
import {
  collectAllOrgUnitIds,
  collectOpenSubtreeIds,
} from '../utils/collect-open-org-subtree.util';
import { resolveEffectiveSignerId } from '../utils/resolve-effective-signer.util';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SignerResolutionService {
  constructor(private readonly prisma: PrismaService) {}

  async refreshOrgUnitEffectiveSigners(orgUnitId?: string): Promise<void> {
    const units = await this.prisma.orgUnit.findMany({
      select: {
        id: true,
        parentId: true,
        signerId: true,
        effectiveSignerId: true,
      },
    });
    const targetIds = orgUnitId
      ? collectOpenSubtreeIds(orgUnitId, units, 'signerId')
      : collectAllOrgUnitIds(units);
    const byId = new Map(units.map((unit) => [unit.id, unit]));
    const updates = targetIds
      .map((id) => {
        const nextValue = resolveEffectiveSignerId(id, units);
        const current = byId.get(id)?.effectiveSignerId ?? null;
        if (nextValue === current) {
          return null;
        }
        return { id, nextValue };
      })
      .filter((row): row is { id: string; nextValue: string | null } => row !== null);
    await applyEffectiveOrgUnitUpdates(this.prisma, 'effectiveSignerId', updates);
  }

  async getEffectiveSignerForOrgUnit(orgUnitId: string): Promise<string | null> {
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
}
