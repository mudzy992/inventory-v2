export const isFinalInventoryCloseAttempt = (
  attemptsMade: number,
  configuredAttempts: number | undefined,
): boolean => attemptsMade + 1 >= Math.max(1, configuredAttempts ?? 1);
