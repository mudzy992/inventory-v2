const ACCESS_TOKEN_KEY = 'accessToken';
const REFRESH_TOKEN_KEY = 'refreshToken';

type TokenChangeListener = () => void;

const listeners = new Set<TokenChangeListener>();

const migrateSessionToLocal = (): void => {
  for (const key of [ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY]) {
    const sessionValue = sessionStorage.getItem(key);
    const localValue = localStorage.getItem(key);
    if (sessionValue && !localValue) {
      localStorage.setItem(key, sessionValue);
    }
    if (sessionValue) {
      sessionStorage.removeItem(key);
    }
  }
};

migrateSessionToLocal();

const notifyTokenChange = (): void => {
  for (const listener of listeners) {
    listener();
  }
};

export const getAccessToken = (): string | null => localStorage.getItem(ACCESS_TOKEN_KEY);

export const getRefreshToken = (): string | null => localStorage.getItem(REFRESH_TOKEN_KEY);

export const setTokens = (accessToken: string, refreshToken: string): void => {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  notifyTokenChange();
};

export const clearTokens = (): void => {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  notifyTokenChange();
};

export const subscribeTokenChange = (listener: TokenChangeListener): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const AUTH_SESSION_EXPIRED_EVENT = 'auth:session-expired';

export const dispatchSessionExpired = (): void => {
  window.dispatchEvent(new CustomEvent(AUTH_SESSION_EXPIRED_EVENT));
};
