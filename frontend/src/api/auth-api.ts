import { apiRequest, clearTokens, setTokens } from './client';
import type { UserRole } from '../types';

export interface AuthUserDto {
  id: string;
  username: string;
  role: UserRole;
  employeeId: string | null;
  registrarScopes: { warehouseId: string; categoryId: string; orgUnitId?: string | null }[];
}

export interface LoginResponseDto {
  tokens: { accessToken: string; refreshToken: string };
  user: AuthUserDto;
}

export const loginApi = async (username: string, password: string): Promise<AuthUserDto> => {
  const response = await apiRequest<LoginResponseDto>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  setTokens(response.tokens.accessToken, response.tokens.refreshToken);
  return response.user;
};

export const logoutApi = async (): Promise<void> => {
  const refreshToken = sessionStorage.getItem('refreshToken');
  if (refreshToken) {
    try {
      await apiRequest('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      });
    } catch {
      // ignore logout errors
    }
  }
  clearTokens();
};

export const fetchMeApi = async (): Promise<AuthUserDto> => apiRequest<AuthUserDto>('/auth/me');
