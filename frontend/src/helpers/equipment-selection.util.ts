import type { Equipment } from '../types';

/**
 * Resolve checked equipment IDs into equipment objects for label printing.
 *
 * Equipment lists are server-paginated, so checked rows may belong to pages
 * which are not currently loaded. Loaded rows are reused; every missing ID
 * is fetched individually. The selection order is retained and IDs which
 * cannot be loaded (deleted or outside the user's scope) are skipped.
 */
export async function resolveSelectedEquipment(
  selectedIds: Iterable<string>,
  loadedItems: readonly Equipment[],
  fetchById: (id: string) => Promise<Equipment | null>,
): Promise<Equipment[]> {
  const selected = [...selectedIds];
  const loadedById = new Map(loadedItems.map((item) => [item.id, item]));
  const missingIds = selected.filter((id) => !loadedById.has(id));

  const fetchedItems = await Promise.all(missingIds.map((id) => fetchById(id)));
  const fetchedById = new Map<string, Equipment>();
  for (const item of fetchedItems) {
    if (item) {
      fetchedById.set(item.id, item);
    }
  }

  return selected.flatMap((id) => {
    const item = loadedById.get(id) ?? fetchedById.get(id);
    return item ? [item] : [];
  });
}
