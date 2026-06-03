import { apiRequest } from './client';
import { fetchCantonsApi, fetchCitiesApi } from './locations-api';
import { fetchNotificationsApi } from './notifications-api';
import { fetchWarehousesApi } from './warehouses-api';
import type {
  AppState,
  Category,
  CategoryField,
  Employee,
  Equipment,
  OrgUnit,
  TransferRecord,
  UserAccount,
  UserRole,
  Notification,
} from '../types';

interface UserListDto {
  id: string;
  username: string;
  role: UserRole;
  employeeId: string | null;
  isActive: boolean;
  registrarScopes: { warehouseId: string; categoryId: string; orgUnitId?: string | null }[];
  lastLoginAt: string | null;
}

const toDateOnly = (value: string | Date): string => {
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toISOString().slice(0, 10);
};

const mapCategory = (row: Category): Category => ({
  ...row,
  fields: row.fields as CategoryField[],
  optionalFields: row.optionalFields as CategoryField[],
});

const mapEquipment = (row: Equipment & { entryDate: string }): Equipment => ({
  ...row,
  entryDate: toDateOnly(row.entryDate),
  specifications:
    typeof row.specifications === 'object' && row.specifications !== null
      ? (row.specifications as Record<string, string>)
      : {},
});

const mapTransfer = (row: TransferRecord & { date: string }): TransferRecord => ({
  ...row,
  date: toDateOnly(row.date),
});

const mapUser = (row: UserListDto): UserAccount => ({
  id: row.id,
  username: row.username,
  role: row.role,
  employeeId: row.employeeId ?? '',
  password: '',
  isActive: row.isActive,
  registrarScopes: row.registrarScopes,
  lastLogin: row.lastLoginAt ?? undefined,
});

export const fetchAppState = async (role: UserRole): Promise<AppState> => {
  const loadLocations = role === 'admin' || role === 'evidenticar' || role === 'skladistar';
  const [orgUnits, employees, categories, equipment, transfers, notifications, cantons, cities, warehouses] =
    await Promise.all([
      apiRequest<OrgUnit[]>('/org-units'),
      apiRequest<Employee[]>('/employees'),
      apiRequest<Category[]>('/categories'),
      apiRequest<Equipment[]>('/equipment'),
      apiRequest<TransferRecord[]>('/transfers'),
      fetchNotificationsApi().catch(() => [] as Notification[]),
      loadLocations ? fetchCantonsApi().catch(() => []) : Promise.resolve([]),
      loadLocations ? fetchCitiesApi().catch(() => []) : Promise.resolve([]),
      loadLocations ? fetchWarehousesApi().catch(() => []) : Promise.resolve([]),
    ]);
  const users =
    role === 'admin' ? (await apiRequest<UserListDto[]>('/users')).map(mapUser) : [];
  return {
    cantons,
    cities,
    warehouses,
    orgUnits,
    employees,
    categories: categories.map(mapCategory),
    equipment: equipment.map(mapEquipment),
    transfers: transfers.map(mapTransfer),
    users,
    notifications,
    savedFilters: [],
    currentUserId: null,
  };
};

export const createOrgUnitApi = (body: Record<string, unknown>) =>
  apiRequest<OrgUnit>('/org-units', { method: 'POST', body: JSON.stringify(body) });

export const updateOrgUnitApi = (id: string, body: Record<string, unknown>) =>
  apiRequest<OrgUnit>(`/org-units/${id}`, { method: 'PATCH', body: JSON.stringify(body) });

export const deleteOrgUnitApi = (id: string) =>
  apiRequest<void>(`/org-units/${id}`, { method: 'DELETE' });

export const createEmployeeApi = (body: Record<string, unknown>) =>
  apiRequest<Employee>('/employees', { method: 'POST', body: JSON.stringify(body) });

export const updateEmployeeApi = (id: string, body: Record<string, unknown>) =>
  apiRequest<Employee>(`/employees/${id}`, { method: 'PATCH', body: JSON.stringify(body) });

export const deleteEmployeeApi = (id: string) =>
  apiRequest<void>(`/employees/${id}`, { method: 'DELETE' });

export const createCategoryApi = (body: Record<string, unknown>) =>
  apiRequest<Category>('/categories', { method: 'POST', body: JSON.stringify(body) });

export const updateCategoryApi = (id: string, body: Record<string, unknown>) =>
  apiRequest<Category>(`/categories/${id}`, { method: 'PATCH', body: JSON.stringify(body) });

export const deleteCategoryApi = (id: string) =>
  apiRequest<void>(`/categories/${id}`, { method: 'DELETE' });

export const createEquipmentApi = (body: Record<string, unknown>) =>
  apiRequest<Equipment>('/equipment', { method: 'POST', body: JSON.stringify(body) });

export const updateEquipmentApi = (id: string, body: Record<string, unknown>) =>
  apiRequest<Equipment>(`/equipment/${id}`, { method: 'PATCH', body: JSON.stringify(body) });

export const deleteEquipmentApi = (id: string) =>
  apiRequest<void>(`/equipment/${id}`, { method: 'DELETE' });

export const createTransferApi = (body: Record<string, unknown>) =>
  apiRequest<TransferRecord>('/transfers', { method: 'POST', body: JSON.stringify(body) });

export const fetchTransferApi = (id: string) => apiRequest<TransferRecord>(`/transfers/${id}`);

export const signTransferApi = (id: string, body: Record<string, unknown> = {}) =>
  apiRequest<TransferRecord>(`/transfers/${id}/sign`, {
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
}

export interface UpdateUserPayload {
  password?: string;
  role?: UserRole;
  employeeId?: string | null;
  isActive?: boolean;
  registrarScopes?: { warehouseId: string; categoryId: string; orgUnitId?: string | null }[];
}

export const createUserApi = (body: CreateUserPayload) =>
  apiRequest<UserListDto>('/users', { method: 'POST', body: JSON.stringify(body) });

export const updateUserApi = (id: string, body: UpdateUserPayload) =>
  apiRequest<UserListDto>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) });

