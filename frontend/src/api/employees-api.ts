import { apiRequest } from './client';
import type { PaginatedListParams, PaginatedResponse } from '../types/pagination';
import { buildListQueryString } from '../types/pagination';
import type { Employee } from '../types';

export interface EmployeesListFilters extends PaginatedListParams {
  orgUnitId?: string;
  withoutUserAccount?: boolean;
}

export const fetchEmployeesPageApi = (params: EmployeesListFilters = {}) => {
  const query = buildListQueryString(params);
  return apiRequest<PaginatedResponse<Employee>>(`/employees${query ? `?${query}` : ''}`);
};

export const searchEmployeesApi = (q: string, limit = 20) => {
  const params = new URLSearchParams({ q });
  if (limit !== 20) {
    params.set('limit', String(limit));
  }
  return apiRequest<Employee[]>(`/employees/search?${params.toString()}`);
};

export const fetchEmployeeApi = (id: string) => apiRequest<Employee>(`/employees/${id}`);

export interface EmployeeProfileHeldEquipment {
  id: string;
  inventoryNumber: string;
  categoryName: string;
  status: string;
}

export interface EmployeeProfileUser {
  id: string;
  email: string;
  role: string;
}

export interface EmployeeProfile {
  employee: Employee;
  user: EmployeeProfileUser | null;
  heldEquipment: EmployeeProfileHeldEquipment[];
  heldEquipmentTotal: number;
}

export const fetchEmployeeProfileApi = (id: string) =>
  apiRequest<EmployeeProfile>(`/employees/${id}/profile`);
