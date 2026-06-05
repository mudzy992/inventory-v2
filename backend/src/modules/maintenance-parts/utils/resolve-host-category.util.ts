import type { PrismaService } from '../../../prisma/prisma.service';

/** Host for maintenance is the equipment's own category (ASSET leaf), not an ancestor. */
export const resolveHostCategoryIdForEquipment = async (
  prisma: PrismaService,
  equipmentCategoryId: string,
): Promise<string | null> => {
  const linkCount = await prisma.categoryMaintenanceLink.count({
    where: { hostCategoryId: equipmentCategoryId },
  });
  return linkCount > 0 ? equipmentCategoryId : null;
};
