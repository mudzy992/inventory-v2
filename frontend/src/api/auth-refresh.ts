import { API_BASE } from './api-base';
import {
  clearTokens,
  getRefreshToken,
  setTokens,
} from './token-storage';

export interface RefreshTokensResponseDto {
  accessToken: string;
  refreshToken: string;
}

export const refreshTokensApi = async (): Promise<void> => {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    clearTokens();
    throw new Error('No refresh token');
  }
  const response = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!response.ok) {
    clearTokens();
    const payload = (await response.json().catch(() => ({}))) as {
      message?: string | string[];
    };
    const message = Array.isArray(payload.message)
      ? payload.message.join(', ')
      : payload.message || response.statusText;
    throw new Error(message);
  }
  const tokens = (await response.json()) as RefreshTokensResponseDto;
  setTokens(tokens.accessToken, tokens.refreshToken);
};
