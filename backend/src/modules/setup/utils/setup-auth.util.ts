export type SetupTokenFailure = 'missing-production-token' | 'invalid-token';

export const getSetupTokenFailure = (
  configuredToken: string | undefined,
  presentedToken: string | undefined,
  isProduction: boolean,
): SetupTokenFailure | undefined => {
  if (!configuredToken || configuredToken.trim().length === 0) {
    return isProduction ? 'missing-production-token' : undefined;
  }
  return presentedToken === configuredToken ? undefined : 'invalid-token';
};
