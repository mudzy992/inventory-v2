const resolveApiBase = (): string => {
  if (import.meta.env.DEV) {
    return '/backend';
  }
  const configured = import.meta.env.VITE_API_URL as string | undefined;
  return configured?.replace(/\/$/, '') || '/backend';
};

export const API_BASE = resolveApiBase();

export const getApiBaseUrl = (): string => API_BASE;
