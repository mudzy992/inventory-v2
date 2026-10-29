import { getApiBaseUrl } from './base';
import { ApiError, parseApiError } from './errors';
import { clearTokens, getAccessToken, getRefreshToken, setTokens } from './tokens';

const AUTH_NO_RETRY = ['/auth/login', '/auth/refresh', '/auth/logout'];

let refreshInFlight: Promise<void> | null = null;
let onSessionExpired: (() => void) | null = null;

export const setSessionExpiredHandler = (handler: (() => void) | null): void => {
  onSessionExpired = handler;
};

const refreshTokens = async (): Promise<void> => {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    throw new ApiError('Session expired', 401);
  }
  const response = await fetch(`${getApiBaseUrl()}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!response.ok) {
    await clearTokens();
    throw await parseApiError(response);
  }
  const tokens = (await response.json()) as { accessToken: string; refreshToken: string };
  await setTokens(tokens.accessToken, tokens.refreshToken);
};

const ensureFresh = async (): Promise<void> => {
  if (!refreshInFlight) {
    refreshInFlight = refreshTokens().finally(() => {
      refreshInFlight = null;
    });
  }
  await refreshInFlight;
};

const execute = async (path: string, options: RequestInit): Promise<Response> => {
  const headers = new Headers(options.headers);
  const token = getAccessToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(`${getApiBaseUrl()}${path}`, { ...options, headers });
};

const withRetry = async (path: string, options: RequestInit): Promise<Response> => {
  let response = await execute(path, options);
  const skip = AUTH_NO_RETRY.some((row) => path.startsWith(row));
  if (response.status !== 401 || skip || !getRefreshToken()) {
    return response;
  }
  try {
    await ensureFresh();
  } catch {
    onSessionExpired?.();
    throw new ApiError('Session expired', 401);
  }
  response = await execute(path, options);
  if (response.status === 401) {
    await clearTokens();
    onSessionExpired?.();
    throw new ApiError('Session expired', 401);
  }
  return response;
};

export const apiRequest = async <T>(path: string, options: RequestInit = {}): Promise<T> => {
  const response = await withRetry(path, options);
  if (!response.ok) {
    throw await parseApiError(response);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  const text = await response.text();
  if (!text.trim()) {
    return undefined as T;
  }
  return JSON.parse(text) as T;
};
