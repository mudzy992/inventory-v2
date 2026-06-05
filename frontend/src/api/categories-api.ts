import { apiRequest } from './client';
import type { Category, CategoryField } from '../types';

const mapCategory = (row: Category): Category => ({
  ...row,
  fields: row.fields as CategoryField[],
  optionalFields: row.optionalFields as CategoryField[],
});

export const fetchCategoriesFlatApi = () =>
  apiRequest<Category[]>('/categories').then((rows) => rows.map(mapCategory));

export const fetchCategoriesTreeApi = () =>
  apiRequest<Category[]>('/categories/tree').then((rows) => rows.map(mapCategory));

export const searchCategoriesApi = (q: string, limit = 20) => {
  const params = new URLSearchParams({ q });
  if (limit !== 20) {
    params.set('limit', String(limit));
  }
  return apiRequest<Category[]>(`/categories/search?${params.toString()}`).then((rows) =>
    rows.map(mapCategory),
  );
};

export const fetchCategoryApi = (id: string) =>
  apiRequest<Category>(`/categories/${id}`).then(mapCategory);
