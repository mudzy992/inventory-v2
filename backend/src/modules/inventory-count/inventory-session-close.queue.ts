import { ensureCorrelationId } from '../../common/utils/correlation-id.util';

export const INVENTORY_SESSION_CLOSE_QUEUE = 'inventory-session-close';
export const INVENTORY_SESSION_CLOSE_JOB_NAME = 'close-session';

export interface InventorySessionCloseJobPayload {
  sessionId: string;
  correlationId?: string;
}

export const buildInventoryCloseJobPayload = (
  sessionId: string,
): InventorySessionCloseJobPayload => ({
  sessionId,
  correlationId: ensureCorrelationId(),
});
