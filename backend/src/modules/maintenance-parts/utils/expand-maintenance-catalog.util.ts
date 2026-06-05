import type { PrismaService } from '../../../prisma/prisma.service';

interface CategoryNode {
  id: string;
  parentId: string | null;
  categoryKind: string;
}

const buildChildrenByParent = (rows: CategoryNode[]): Map<string | null, string[]> => {
  const map = new Map<string | null, string[]>();
  for (const row of rows) {
    const siblings = map.get(row.parentId) ?? [];
    siblings.push(row.id);
    map.set(row.parentId, siblings);
  }
  return map;
};

const collectDescendantLeaves = (
  categoryId: string,
  childrenByParent: Map<string | null, string[]>,
): string[] => {
  const childIds = childrenByParent.get(categoryId) ?? [];
  if (childIds.length === 0) {
    return [categoryId];
  }
  const leaves: string[] = [];
  for (const childId of childIds) {
    leaves.push(...collectDescendantLeaves(childId, childrenByParent));
  }
  return leaves;
};

export const expandLinkedMaintenanceToLeafIds = async (
  prisma: PrismaService,
  linkedCategoryIds: string[],
): Promise<Set<string>> => {
  if (linkedCategoryIds.length === 0) {
    return new Set();
  }
  const rows = await prisma.category.findMany({
    where: { categoryKind: 'MAINTENANCE' },
    select: { id: true, parentId: true, categoryKind: true },
  });
  const childrenByParent = buildChildrenByParent(rows);
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const leafIds = new Set<string>();
  for (const linkedId of linkedCategoryIds) {
    const node = rowById.get(linkedId);
    if (!node) {
      continue;
    }
    const descendants = collectDescendantLeaves(linkedId, childrenByParent);
    const hasChildren = (childrenByParent.get(linkedId) ?? []).length > 0;
    if (hasChildren) {
      for (const leafId of descendants) {
        leafIds.add(leafId);
      }
    } else {
      leafIds.add(linkedId);
    }
  }
  return leafIds;
};

export const isMaintenanceLeafAllowedForHost = async (
  prisma: PrismaService,
  hostCategoryId: string,
  maintenanceLeafCategoryId: string,
): Promise<boolean> => {
  const links = await prisma.categoryMaintenanceLink.findMany({
    where: { hostCategoryId },
    select: { maintenanceCategoryId: true },
  });
  if (links.length === 0) {
    return false;
  }
  const linkedIds = links.map((row) => row.maintenanceCategoryId);
  const allowedLeaves = await expandLinkedMaintenanceToLeafIds(prisma, linkedIds);
  return allowedLeaves.has(maintenanceLeafCategoryId);
};
