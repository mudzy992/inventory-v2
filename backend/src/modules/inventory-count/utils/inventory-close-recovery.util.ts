export const buildInventoryCloseRecoveryJobId = (closeJobId: string, updatedAt: Date): string =>
  `inventory-close-recovery-${closeJobId}-${updatedAt.getTime()}`;
