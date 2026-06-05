import { apiRequest } from './client';
import { fetchAllPaginatedItems } from './fetch-all-paginated';
import type { PaginatedListParams, PaginatedResponse } from '../types/pagination';
import { buildListQueryString } from '../types/pagination';
import type { UserAccount, UserRole } from '../types';

interface UserListDto {
  id: string;
  username: string;
  role: UserRole;
  employeeId: string | null;
  isActive: boolean;
  registrarScopes: { warehouseId: string; categoryId: string; orgUnitId?: string | null }[];
  lastLoginAt: string | null;
}

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

export const fetchUsersPageApi = async (params: PaginatedListParams = {}) => {
  const query = buildListQueryString(params);
  const response = await apiRequest<PaginatedResponse<UserListDto>>(
    `/users${query ? `?${query}` : ''}`,
  );
  return {
    ...response,
    items: response.items.map(mapUser),
  };
};

export const fetchSkladistarUsersApi = async () => {
  const users = await fetchAllPaginatedItems((params) => fetchUsersPageApi(params), 100);
  return users.filter((user) => user.role === 'skladistar');
};
