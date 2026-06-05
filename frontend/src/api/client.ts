import { refreshTokensApi } from './auth-refresh';
import { API_BASE } from './api-base';
import {
  clearTokens,
  dispatchSessionExpired,
  getAccessToken,
  getRefreshToken,
} from './token-storage';

export { getApiBaseUrl } from './api-base';
export {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setTokens,
} from './token-storage';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const AUTH_NO_RETRY_PATHS = ['/auth/login', '/auth/refresh', '/auth/logout'];

let refreshInFlight: Promise<void> | null = null;

const shouldRetryAuth = (path: string, status: number): boolean => {
  if (status !== 401) {
    return false;
  }
  if (AUTH_NO_RETRY_PATHS.some((skip) => path.startsWith(skip))) {
    return false;
  }
  return Boolean(getRefreshToken());
};

export const ensureAccessTokenFresh = async (): Promise<void> => {
  if (!getRefreshToken()) {
    throw new ApiError('Session expired', 401);
  }
  if (!refreshInFlight) {
    refreshInFlight = refreshTokensApi().finally(() => {
      refreshInFlight = null;
    });
  }
  await refreshInFlight;
};

const handleSessionFailure = (): void => {
  clearTokens();
  dispatchSessionExpired();
};

const buildAuthHeaders = (options: RequestInit): Headers => {
  const headers = new Headers(options.headers);
  const token = getAccessToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const hasBody = options.body !== undefined && options.body !== null;
  if (hasBody && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return headers;
};

const executeFetch = async (path: string, options: RequestInit): Promise<Response> => {
  const headers = buildAuthHeaders(options);
  return fetch(`${API_BASE}${path}`, { ...options, headers });
};

const parseApiError = async (response: Response): Promise<ApiError> => {
  const payload = (await response.json().catch(() => ({}))) as { message?: string | string[] };
  const message = Array.isArray(payload.message)
    ? payload.message.join(', ')
    : payload.message || response.statusText;
  return new ApiError(message, response.status);
};

const fetchWithAuthRetry = async (path: string, options: RequestInit): Promise<Response> => {
  let response = await executeFetch(path, options);
  if (!shouldRetryAuth(path, response.status)) {
    return response;
  }
  try {
    await ensureAccessTokenFresh();
  } catch (err) {
    handleSessionFailure();
    if (err instanceof ApiError) {
      throw err;
    }
    throw new ApiError('Session expired', 401);
  }
  response = await executeFetch(path, options);
  if (response.status === 401) {
    handleSessionFailure();
    throw new ApiError('Session expired', 401);
  }
  return response;
};

export const apiRequest = async <T>(path: string, options: RequestInit = {}): Promise<T> => {
  const response = await fetchWithAuthRetry(path, options);
  if (!response.ok) {
    throw await parseApiError(response);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
};

export const fetchAuthenticatedBlob = async (path: string): Promise<Blob> => {
  const response = await fetchWithAuthRetry(path, { method: 'GET' });
  if (!response.ok) {
    throw await parseApiError(response);
  }
  return response.blob();
};
