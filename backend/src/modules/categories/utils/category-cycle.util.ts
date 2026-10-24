export interface CategoryParentNode {
  id: string;
  parentId: string | null;
}

export const wouldCreateCategoryCycle = (
  categoryId: string,
  proposedParentId: string | null,
  categories: CategoryParentNode[],
): boolean => {
  const parentById = new Map(categories.map(({ id, parentId }) => [id, parentId]));
  const visited = new Set<string>();
  let currentId = proposedParentId;

  while (currentId) {
    if (currentId === categoryId || visited.has(currentId)) {
      return true;
    }
    visited.add(currentId);
    currentId = parentById.get(currentId) ?? null;
  }
  return false;
};
