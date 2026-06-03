const resolveApiBase = (): string => {
  if (import.meta.env.DEV) {
    return '/backend';
  }
  const configured = import.meta.env.VITE_API_URL as string | undefined;
  return configured?.replace(/\/$/, '') || '/backend';
};

const API_BASE = resolveApiBase();

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const getAccessToken = (): string | null => sessionStorage.getItem('accessToken');

export const setTokens = (accessToken: string, refreshToken: string): void => {
  sessionStorage.setItem('accessToken', accessToken);
  sessionStorage.setItem('refreshToken', refreshToken);
};

export const clearTokens = (): void => {
  sessionStorage.removeItem('accessToken');
  sessionStorage.removeItem('refreshToken');
};

export const apiRequest = async <T>(path: string, options: RequestInit = {}): Promise<T> => {
  const headers = new Headers(options.headers);
  const token = getAccessToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const hasBody = options.body !== undefined && options.body !== null;
  if (hasBody && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { message?: string | string[] };
    const message = Array.isArray(payload.message)
      ? payload.message.join(', ')
      : payload.message || response.statusText;
    throw new ApiError(message, response.status);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
};

export const getApiBaseUrl = (): string => API_BASE;

export const fetchAuthenticatedBlob = async (path: string): Promise<Blob> => {
  const token = sessionStorage.getItem('accessToken');
  const headers = new Headers();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const response = await fetch(`${API_BASE}${path}`, { headers });
  if (!response.ok) {
    throw new ApiError(response.statusText, response.status);
  }
  return response.blob();
};
