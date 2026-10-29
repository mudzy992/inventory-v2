import * as SecureStore from 'expo-secure-store';

const ACCESS = 'evidens.accessToken';
const REFRESH = 'evidens.refreshToken';

let accessToken: string | null = null;
let refreshToken: string | null = null;

export const hydrateTokens = async (): Promise<void> => {
  accessToken = await SecureStore.getItemAsync(ACCESS);
  refreshToken = await SecureStore.getItemAsync(REFRESH);
};

export const getAccessToken = (): string | null => accessToken;
export const getRefreshToken = (): string | null => refreshToken;

export const setTokens = async (nextAccess: string, nextRefresh: string): Promise<void> => {
  accessToken = nextAccess;
  refreshToken = nextRefresh;
  await SecureStore.setItemAsync(ACCESS, nextAccess);
  await SecureStore.setItemAsync(REFRESH, nextRefresh);
};

export const clearTokens = async (): Promise<void> => {
  accessToken = null;
  refreshToken = null;
  await SecureStore.deleteItemAsync(ACCESS);
  await SecureStore.deleteItemAsync(REFRESH);
};
