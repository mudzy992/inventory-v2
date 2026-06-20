import { apiRequest } from './client';
import { fetchCategoriesFlatApi } from './categories-api';
import { fetchNotificationsApi } from './notifications-api';
import { fetchOrgUnitsFlatApi } from './org-units-api';
import { fetchCantonsApi, fetchCitiesApi } from './locations-api';
import { fetchAllPaginatedItems } from './fetch-all-paginated';
import { fetchWarehousesPageApi } from './warehouses-api';
import type {
  AppState,
  UserRole,
  Notification,
} from '../types';

/** Lightweight bootstrap: reference data + notifications; large lists load per-page. */
export const fetchBootstrap = async (role: UserRole): Promise<AppState> => {
  const loadLocations =
    role === 'admin' || role === 'moderator' || role === 'evidenticar' || role === 'skladistar';
  const [orgUnits, categories, notifications, cantons, cities, warehouses] = await Promise.all([
    fetchOrgUnitsFlatApi(),
    fetchCategoriesFlatApi(),
    fetchNotificationsApi().catch(() => [] as Notification[]),
    loadLocations ? fetchCantonsApi().catch(() => []) : Promise.resolve([]),
    loadLocations ? fetchCitiesApi().catch(() => []) : Promise.resolve([]),
    loadLocations
      ? fetchAllPaginatedItems((params) => fetchWarehousesPageApi(params)).catch(() => [])
      : Promise.resolve([]),
  ]);
  const normalizedCantons = cantons.map(({ cities: _nested, ...canton }) => canton);
  return {
    cantons: normalizedCantons,
    cities,
    warehouses,
    orgUnits,
    employees: [],
    categories,
    equipment: [],
    transfers: [],
    users: [],
    notifications,
    savedFilters: [],
    currentUserId: null,
  };
};

/** @deprecated Use fetchBootstrap — kept as alias for compatibility */
export const fetchAppState = fetchBootstrap;

export const createOrgUnitApi = (body: Record<string, unknown>) =>
  apiRequest('/org-units', { method: 'POST', body: JSON.stringify(body) });

export const updateOrgUnitApi = (id: string, body: Record<string, unknown>) =>
  apiRequest(`/org-units/${id}`, { method: 'PATCH', body: JSON.stringify(body) });

export const deleteOrgUnitApi = (id: string) =>
  apiRequest<void>(`/org-units/${id}`, { method: 'DELETE' });

export const createEmployeeApi = (body: Record<string, unknown>) =>
  apiRequest('/employees', { method: 'POST', body: JSON.stringify(body) });

export const updateEmployeeApi = (id: string, body: Record<string, unknown>) =>
  apiRequest(`/employees/${id}`, { method: 'PATCH', body: JSON.stringify(body) });

export const deleteEmployeeApi = (id: string) =>
  apiRequest<void>(`/employees/${id}`, { method: 'DELETE' });

export const createCategoryApi = (body: Record<string, unknown>) =>
  apiRequest('/categories', { method: 'POST', body: JSON.stringify(body) });

export const updateCategoryApi = (id: string, body: Record<string, unknown>) =>
  apiRequest(`/categories/${id}`, { method: 'PATCH', body: JSON.stringify(body) });

export const deleteCategoryApi = (id: string) =>
  apiRequest<void>(`/categories/${id}`, { method: 'DELETE' });

export const createEquipmentApi = (body: Record<string, unknown>) =>
  apiRequest('/equipment', { method: 'POST', body: JSON.stringify(body) });

export const updateEquipmentApi = (id: string, body: Record<string, unknown>) =>
  apiRequest(`/equipment/${id}`, { method: 'PATCH', body: JSON.stringify(body) });

export const deleteEquipmentApi = (id: string) =>
  apiRequest<void>(`/equipment/${id}`, { method: 'DELETE' });

export const createTransferApi = (body: Record<string, unknown>) =>
  apiRequest('/transfers', { method: 'POST', body: JSON.stringify(body) });

export const fetchTransferApi = (id: string) => apiRequest(`/transfers/${id}`);

export const signTransferApi = (id: string, body: Record<string, unknown> = {}) =>
  apiRequest(`/transfers/${id}/sign`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });

export const uploadTransferDocumentApi = async (
  transferId: string,
  file: File,
): Promise<void> => {
  const formData = new FormData();
  formData.append('transferId', transferId);
  formData.append('file', file);
  await apiRequest('/uploads', { method: 'POST', body: formData });
};

export interface CreateUserPayload {
  username: string;
  password: string;
  role: UserRole;
  employeeId: string;
  isActive?: boolean;
  registrarScopes?: { warehouseId: string; categoryId: string; orgUnitId?: string | null }[];
  coordinatorAssignments?: { warehouseId: string; orgUnitId?: string | null }[];
  moderatorOrgAssignments?: { orgUnitId: string }[];
  moderatorWarehouseAssignments?: { warehouseId: string }[];
}

export interface UpdateUserPayload {
  password?: string;
  role?: UserRole;
  employeeId?: string | null;
  isActive?: boolean;
  registrarScopes?: { warehouseId: string; categoryId: string; orgUnitId?: string | null }[];
  coordinatorAssignments?: { warehouseId: string; orgUnitId?: string | null }[];
  moderatorOrgAssignments?: { orgUnitId: string }[];
  moderatorWarehouseAssignments?: { warehouseId: string }[];
}

export const createUserApi = (body: CreateUserPayload) =>
  apiRequest('/users', { method: 'POST', body: JSON.stringify(body) });

export const updateUserApi = (id: string, body: UpdateUserPayload) =>
  apiRequest(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
