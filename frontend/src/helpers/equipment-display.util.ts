import type { Category, Equipment } from '../types';

export interface UniqueFieldDisplay {
  label: string;
  value: string;
}

export const buildEquipmentDisplayName = (
  category: Category | undefined,
  specifications: Record<string, string> | undefined,
): string => {
  const categoryName = category?.name ?? '';
  const spec = Object.values(specifications ?? {})
    .filter(Boolean)
    .slice(0, 2)
    .join(', ');
  return [categoryName, spec].filter(Boolean).join(' — ');
};

export const getUniqueFieldsDisplay = (
  category: Category | undefined,
  specifications: Record<string, string> | undefined,
): UniqueFieldDisplay[] => {
  if (!category) {
    return [];
  }
  return category.fields
    .filter((field) => field.unique)
    .map((field) => {
      const value = specifications?.[field.id]?.trim();
      if (!value) {
        return null;
      }
      return { label: field.name, value };
    })
    .filter((row): row is UniqueFieldDisplay => row !== null);
};

export const getUniqueFieldDisplay = (
  category: Category | undefined,
  specifications: Record<string, string> | undefined,
): UniqueFieldDisplay | null => getUniqueFieldsDisplay(category, specifications)[0] ?? null;

export const buildEquipmentQrUrl = (equipment: Pick<Equipment, 'id'>): string => {
  const configured = import.meta.env.VITE_APP_URL as string | undefined;
  const base = configured?.replace(/\/$/, '') || window.location.origin;
  return `${base}/equipment/${equipment.id}`;
};
