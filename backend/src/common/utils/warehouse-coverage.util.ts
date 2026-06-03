import { BadRequestException } from '@nestjs/common';
import type { OrgScopeService } from '../services/org-scope.service';
import type { PrismaService } from '../../prisma/prisma.service';

export const assertRazduzenjeWarehouseCoverage = async (
  prisma: PrismaService,
  orgScopeService: OrgScopeService,
  holderOrgUnitId: string,
  toWarehouseId: string,
): Promise<void> => {
  const warehouse = await prisma.warehouse.findUnique({
    where: { id: toWarehouseId },
    select: { orgUnitId: true, name: true },
  });
  if (!warehouse) {
    throw new BadRequestException('Warehouse not found');
  }
  if (!warehouse.orgUnitId) {
    return;
  }
  const subtreeIds = await orgScopeService.expandOrgUnitIds([warehouse.orgUnitId]);
  if (!subtreeIds.includes(holderOrgUnitId)) {
    throw new BadRequestException(
      `Razduzenje target warehouse "${warehouse.name}" does not cover holder org unit`,
    );
  }
};
