export const INVENTORY_CLOSE_LEASE_MS = 120_000;
export const INVENTORY_CLOSE_HEARTBEAT_MS = 30_000;

export const getInventoryCloseLeaseUntil = (now: Date = new Date()): Date =>
  new Date(now.getTime() + INVENTORY_CLOSE_LEASE_MS);

export const buildInventoryCloseJobClaimWhere = (jobId: string, now: Date) => ({
  id: jobId,
  OR: [
    { status: 'queued' as const },
    {
      status: 'running' as const,
      OR: [{ leaseUntil: { lte: now } }, { leaseUntil: null }],
    },
  ],
});
