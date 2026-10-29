import { DEFAULT_API_URL } from '@/theme/tokens';

export const getApiBaseUrl = (): string => {
  const raw = process.env.EXPO_PUBLIC_API_URL?.trim();
  return (raw || DEFAULT_API_URL).replace(/\/$/, '');
};
