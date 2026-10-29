import type { Employee, EmployeeProfile, Paginated } from '@/types/models';
import { apiRequest } from './client';
import { buildQuery } from './query';

export const fetchEmployeesPageApi = (params: {
  search?: string;
  page?: number;
  pageSize?: number;
  isActive?: boolean;
}): Promise<Paginated<Employee>> => apiRequest(`/employees${buildQuery(params)}`);

export const fetchEmployeeProfileApi = (id: string): Promise<EmployeeProfile> =>
  apiRequest<EmployeeProfile>(`/employees/${id}/profile`);
