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

export const getUniqueFieldDisplay = (
  category: Category | undefined,
  specifications: Record<string, string> | undefined,
): UniqueFieldDisplay | null => {
  if (!category) {
    return null;
  }
  const all = [...(category.fields ?? []), ...(category.optionalFields ?? [])];
  const uniqueField = all.find((field) => field.unique);
  if (!uniqueField) {
    return null;
  }
  const value = specifications?.[uniqueField.id]?.trim();
  if (!value) {
    return null;
  }
  return { label: uniqueField.name, value };
};

export const buildEquipmentQrUrl = (equipment: Pick<Equipment, 'id'>): string => {
  const configured = import.meta.env.VITE_APP_URL as string | undefined;
  const base = configured?.replace(/\/$/, '') || window.location.origin;
  return `${base}/equipment/${equipment.id}`;
};
