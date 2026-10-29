import type { AuthUser } from '@/types/models';
import { apiRequest } from './client';
import { clearTokens, getRefreshToken, setTokens } from './tokens';

interface LoginResponse {
  tokens: { accessToken: string; refreshToken: string };
  user: AuthUser;
}

export const loginApi = async (username: string, password: string): Promise<AuthUser> => {
  const response = await apiRequest<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  await setTokens(response.tokens.accessToken, response.tokens.refreshToken);
  return response.user;
};

export const logoutApi = async (): Promise<void> => {
  const refreshToken = getRefreshToken();
  if (refreshToken) {
    try {
      await apiRequest('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      });
    } catch {
      // ignore
    }
  }
  await clearTokens();
};

export const fetchMeApi = (): Promise<AuthUser> => apiRequest<AuthUser>('/auth/me');
