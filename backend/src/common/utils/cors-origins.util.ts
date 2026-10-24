export type CorsOriginPolicy = boolean | string[];

export const resolveCorsOriginPolicy = (
  rawOrigins: string | undefined,
  isProduction: boolean,
): CorsOriginPolicy => {
  const origins = rawOrigins
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (!origins?.length) {
    if (isProduction) {
      throw new Error('CORS_ORIGIN must be explicitly configured in production');
    }
    return true;
  }

  if (isProduction && origins.includes('*')) {
    throw new Error('CORS_ORIGIN cannot contain a wildcard in production');
  }

  return origins;
};
