import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import {
  expandLinkedMaintenanceToLeaves,
  getMaintenanceLeafCategories,
  getMaintenanceParentCategories,
} from '../../helpers/expand-maintenance-catalog.util';
import type { Category } from '../../types';
import { SearchableAutocomplete } from '../searchable-autocomplete';

interface CategoryMaintenanceLinksEditorProps {
  linkedIds: string[];
  allCategories: Category[];
  onChange: (linkedIds: string[]) => void;
}

const resolveActiveGroupIds = (
  linkedIds: string[],
  maintenanceParents: Category[],
  maintenanceLeaves: Category[],
): string[] => {
  const active = new Set<string>();
  for (const parent of maintenanceParents) {
    if (linkedIds.includes(parent.id)) {
      active.add(parent.id);
      continue;
    }
    const hasChild = maintenanceLeaves.some(
      (leaf) => leaf.parentId === parent.id && linkedIds.includes(leaf.id),
    );
    if (hasChild) {
      active.add(parent.id);
    }
  }
  for (const leaf of maintenanceLeaves) {
    if (!leaf.parentId && linkedIds.includes(leaf.id)) {
      active.add(leaf.id);
    }
  }
  return [...active];
};

export const CategoryMaintenanceLinksEditor = ({
  linkedIds,
  allCategories,
  onChange,
}: CategoryMaintenanceLinksEditorProps) => {
  const maintenanceParents = useMemo(
    () => getMaintenanceParentCategories(allCategories),
    [allCategories],
  );
  const maintenanceLeaves = useMemo(
    () => getMaintenanceLeafCategories(allCategories),
    [allCategories],
  );
  const orphanLeaves = useMemo(
    () => maintenanceLeaves.filter(
      (leaf) => !leaf.parentId || !maintenanceParents.some((parent) => parent.id === leaf.parentId),
    ),
    [maintenanceLeaves, maintenanceParents],
  );
  const [pickerGroupId, setPickerGroupId] = useState('');
  const [visibleGroupIds, setVisibleGroupIds] = useState<string[]>([]);
  useEffect(() => {
    const active = resolveActiveGroupIds(linkedIds, maintenanceParents, maintenanceLeaves);
    setVisibleGroupIds((prev) => [...new Set([...active, ...prev])]);
  }, [linkedIds, maintenanceLeaves, maintenanceParents]);
  const groupOptions = useMemo(
    () => maintenanceParents.map((parent) => ({
      id: parent.id,
      label: parent.name,
      subLabel: `${maintenanceLeaves.filter((leaf) => leaf.parentId === parent.id).length} tipova`,
    })),
    [maintenanceLeaves, maintenanceParents],
  );
  const visibleExclude = useMemo(() => new Set(visibleGroupIds), [visibleGroupIds]);
  const handleAddGroup = (groupId: string) => {
    if (!groupId || visibleGroupIds.includes(groupId)) {
      return;
    }
    setVisibleGroupIds((prev) => [...prev, groupId]);
    setPickerGroupId('');
  };
  const handleRemoveGroup = (groupId: string) => {
    const leaves = maintenanceLeaves.filter((leaf) => leaf.parentId === groupId);
    const removeIds = new Set([groupId, ...leaves.map((leaf) => leaf.id)]);
    onChange(linkedIds.filter((id) => !removeIds.has(id)));
    setVisibleGroupIds((prev) => prev.filter((id) => id !== groupId));
  };
  const isLeafChecked = (leafId: string, parentId: string): boolean =>
    linkedIds.includes(leafId) || linkedIds.includes(parentId);
  const handleToggleLeaf = (leafId: string, parentId: string) => {
    const checked = isLeafChecked(leafId, parentId);
    if (checked) {
      const next = linkedIds.filter((id) => id !== leafId && id !== parentId);
      onChange(next);
      return;
    }
    const siblingLeaves = maintenanceLeaves.filter((leaf) => leaf.parentId === parentId);
    const next = [...linkedIds.filter((id) => id !== parentId), leafId];
    const allSiblingsChecked = siblingLeaves.every(
      (leaf) => leaf.id === leafId || next.includes(leaf.id),
    );
    if (allSiblingsChecked) {
      onChange([...new Set([...next.filter((id) => !siblingLeaves.some((leaf) => leaf.id === id)), parentId])]);
      return;
    }
    onChange([...new Set(next)]);
  };
  const handleToggleOrphanLeaf = (leafId: string) => {
    onChange(
      linkedIds.includes(leafId)
        ? linkedIds.filter((id) => id !== leafId)
        : [...linkedIds, leafId],
    );
    if (!visibleGroupIds.includes(leafId)) {
      setVisibleGroupIds((prev) => [...prev, leafId]);
    }
  };
  const previewLeaves = expandLinkedMaintenanceToLeaves(linkedIds, allCategories);
  if (maintenanceParents.length === 0 && orphanLeaves.length === 0) {
    return (
      <p className="text-xs text-gray-500">
        Nema kategorija održavanja. Dodajte ih u tabu „Kategorije održavanja”.
      </p>
    );
  }
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Dodaj grupu održavanja</label>
        <SearchableAutocomplete
          options={groupOptions}
          value={pickerGroupId}
          onChange={(id) => {
            handleAddGroup(id);
          }}
          placeholder="Pretraži grupe (npr. Računarski dijelovi)…"
          ariaLabel="Grupa održavanja"
          excludeIds={visibleExclude}
        />
      </div>
      {visibleGroupIds.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-4 border border-dashed border-gray-200 rounded-lg">
          Odaberite grupu iz padajućeg menija da definišete dostupne dijelove.
        </p>
      ) : (
        <div className="space-y-3">
          {visibleGroupIds.map((groupId) => {
            const parent = maintenanceParents.find((row) => row.id === groupId);
            const leaves = maintenanceLeaves.filter((leaf) => leaf.parentId === groupId);
            const orphan = orphanLeaves.find((row) => row.id === groupId);
            if (!parent && orphan) {
              return (
                <div key={groupId} className="rounded-lg border border-gray-200 bg-white p-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-sm font-medium text-gray-800">{orphan.name}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveGroup(groupId)}
                      className="text-gray-400 hover:text-red-500 p-1"
                      aria-label="Ukloni grupu"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <label className="inline-flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={linkedIds.includes(orphan.id)}
                      onChange={() => handleToggleOrphanLeaf(orphan.id)}
                      className="rounded"
                    />
                    {orphan.name}
                  </label>
                </div>
              );
            }
            if (!parent) {
              return null;
            }
            return (
              <div key={groupId} className="rounded-lg border border-amber-200 bg-amber-50/30 p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-sm font-medium text-gray-800">{parent.name}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveGroup(groupId)}
                    className="text-gray-400 hover:text-red-500 p-1"
                    aria-label={`Ukloni ${parent.name}`}
                  >
                    <X size={14} />
                  </button>
                </div>
                {leaves.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {leaves.map((leaf) => (
                      <label
                        key={leaf.id}
                        className="inline-flex items-center gap-1.5 text-xs bg-white border border-gray-200 rounded-lg px-2 py-1 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={isLeafChecked(leaf.id, parent.id)}
                          onChange={() => handleToggleLeaf(leaf.id, parent.id)}
                          className="rounded"
                        />
                        {leaf.name}
                      </label>
                    ))}
                  </div>
                ) : (
                  <label className="inline-flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={linkedIds.includes(parent.id)}
                      onChange={() => handleToggleLeaf(parent.id, parent.id)}
                      className="rounded"
                    />
                    Cijela grupa
                  </label>
                )}
              </div>
            );
          })}
        </div>
      )}
      {previewLeaves.length > 0 ? (
        <p className="text-[11px] text-gray-500">
          Na ugradnji dostupno: {previewLeaves.map((row) => row.name).join(', ')}
        </p>
      ) : null}
    </div>
  );
};
