import type { Category, CategoryField, Equipment } from '../types';

export interface UniqueFieldDisplay {
  label: string;
  value: string;
}

const isSerialFieldName = (name: string): boolean => /serijsk/i.test(name);

const getAllCategorySpecFields = (category: Category | undefined): CategoryField[] => {
  if (!category) {
    return [];
  }
  return [...category.fields, ...category.optionalFields];
};

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

export const getSerialNumberDisplay = (
  category: Category | undefined,
  specifications: Record<string, string> | undefined,
): UniqueFieldDisplay | null => {
  if (!category) {
    return null;
  }
  const fields = getAllCategorySpecFields(category);
  const serialField = fields.find((field) => isSerialFieldName(field.name));
  if (serialField) {
    const value = specifications?.[serialField.id]?.trim();
    if (value) {
      return { label: serialField.name, value };
    }
  }
  const uniqueField = fields.find((field) => field.unique);
  if (uniqueField) {
    const value = specifications?.[uniqueField.id]?.trim();
    if (value) {
      return { label: uniqueField.name, value };
    }
  }
  return null;
};

export const categoryHasSerialField = (category: Category | undefined): boolean => {
  if (!category) {
    return false;
  }
  return getAllCategorySpecFields(category).some((field) => isSerialFieldName(field.name));
};

export const buildInventoryPrintEquipmentName = (
  category: Category | undefined,
  stockLot: { productName: string } | null | undefined,
  specifications: Record<string, string> | undefined,
): string => {
  const lotName = stockLot?.productName?.trim();
  if (!lotName) {
    return '—';
  }
  const categoryName = category?.name ?? '';
  if (categoryHasSerialField(category)) {
    const serialField = getAllCategorySpecFields(category!).find((field) =>
      isSerialFieldName(field.name),
    );
    const serialValue = serialField ? specifications?.[serialField.id]?.trim() : undefined;
    if (serialValue) {
      return [lotName, serialValue, categoryName].filter(Boolean).join(' — ');
    }
  }
  return [lotName, categoryName].filter(Boolean).join(' — ');
};

export const buildEquipmentQrUrl = (equipment: Pick<Equipment, 'id'>): string => {
  const configured = import.meta.env.VITE_APP_URL as string | undefined;
  const base = configured?.replace(/\/$/, '') || window.location.origin;
  return `${base}/equipment/${equipment.id}`;
};
