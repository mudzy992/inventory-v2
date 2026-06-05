import type { Category } from '../types';

export const isAssetLeafCategory = (category: Category, categories: Category[]): boolean =>
  (category.categoryKind ?? 'ASSET') === 'ASSET' &&
  !categories.some((row) => row.parentId === category.id);

export const getMaintenanceLeafCategories = (categories: Category[]): Category[] =>
  categories.filter(
    (row) =>
      row.categoryKind === 'MAINTENANCE' &&
      !categories.some((child) => child.parentId === row.id),
  );

export const getMaintenanceParentCategories = (categories: Category[]): Category[] =>
  categories.filter(
    (row) =>
      row.categoryKind === 'MAINTENANCE' &&
      categories.some((child) => child.parentId === row.id),
  );

export const expandLinkedMaintenanceToLeaves = (
  linkedCategoryIds: string[],
  allCategories: Category[],
): Category[] => {
  const leaves = getMaintenanceLeafCategories(allCategories);
  const leafById = new Map(leaves.map((row) => [row.id, row]));
  const childrenByParent = new Map<string | null, string[]>();
  for (const row of allCategories.filter((c) => c.categoryKind === 'MAINTENANCE')) {
    const siblings = childrenByParent.get(row.parentId) ?? [];
    siblings.push(row.id);
    childrenByParent.set(row.parentId, siblings);
  }
  const collectLeaves = (categoryId: string): string[] => {
    const childIds = childrenByParent.get(categoryId) ?? [];
    if (childIds.length === 0) {
      return [categoryId];
    }
    return childIds.flatMap((childId) => collectLeaves(childId));
  };
  const result = new Map<string, Category>();
  for (const linkedId of linkedCategoryIds) {
    for (const leafId of collectLeaves(linkedId)) {
      const leaf = leafById.get(leafId);
      if (leaf) {
        result.set(leaf.id, leaf);
      }
    }
  }
  return [...result.values()].sort((a, b) => a.name.localeCompare(b.name));
};

export const isMaintenanceGroupFullyLinked = (
  groupId: string,
  linkedIds: string[],
  allCategories: Category[],
): boolean => {
  const childLeaves = expandLinkedMaintenanceToLeaves([groupId], allCategories);
  if (childLeaves.length === 0) {
    return linkedIds.includes(groupId);
  }
  return childLeaves.every((leaf) => linkedIds.includes(leaf.id));
};

export const toggleMaintenanceGroupLink = (
  groupId: string,
  linkedIds: string[],
  allCategories: Category[],
): string[] => {
  const childLeaves = expandLinkedMaintenanceToLeaves([groupId], allCategories);
  const isFullyLinked = isMaintenanceGroupFullyLinked(groupId, linkedIds, allCategories);
  if (isFullyLinked) {
    const removeIds = new Set([groupId, ...childLeaves.map((row) => row.id)]);
    return linkedIds.filter((id) => !removeIds.has(id));
  }
  const addIds = [groupId, ...childLeaves.map((row) => row.id)];
  return [...new Set([...linkedIds, ...addIds])];
};
