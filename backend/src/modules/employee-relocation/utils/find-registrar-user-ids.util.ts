import type { PrismaService } from '../../../prisma/prisma.service';
import type { RegistrarScopeService } from '../../../common/services/registrar-scope.service';

export const findRegistrarUserIds = async (
  prisma: PrismaService,
  registrarScope: RegistrarScopeService,
  warehouseId: string,
  categoryId: string,
): Promise<string[]> => {
  const assignments = await prisma.registrarAssignment.findMany({
    where: {
      warehouseId,
      user: { role: 'evidenticar', isActive: true },
    },
    select: { userId: true, categoryId: true },
  });
  const userIds = new Set<string>();
  for (const assignment of assignments) {
    const expanded = await registrarScope.expandCategoryIds([assignment.categoryId]);
    if (expanded.has(categoryId)) {
      userIds.add(assignment.userId);
    }
  }
  return [...userIds];
};

export const isWarehouseCategoryTreeCovered = async (
  prisma: PrismaService,
  registrarScope: RegistrarScopeService,
  warehouseId: string,
  rootCategoryId: string,
): Promise<boolean> => {
  const assignments = await prisma.registrarAssignment.findMany({
    where: { warehouseId },
    select: { categoryId: true },
  });
  if (assignments.length === 0) {
    return false;
  }
  const rootTree = await registrarScope.expandCategoryIds([rootCategoryId]);
  for (const assignment of assignments) {
    const assignedTree = await registrarScope.expandCategoryIds([assignment.categoryId]);
    for (const categoryId of assignedTree) {
      if (rootTree.has(categoryId)) {
        return true;
      }
    }
  }
  return false;
};

export const findAdminUserIds = async (prisma: PrismaService): Promise<string[]> => {
  const admins = await prisma.user.findMany({
    where: { role: 'admin', isActive: true },
    select: { id: true },
  });
  return admins.map((row) => row.id);
};
