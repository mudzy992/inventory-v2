import { useEffect, useState } from 'react';
import { getAccessToken, subscribeTokenChange } from '../api/token-storage';
import { getOrCreateNotificationsSocket } from '../api/socket-client';
import { useAuth } from '../contexts/AuthContext';

export interface InventoryCloseJobSocketPayload {
  sessionId: string;
  status: string;
  appliedCount: number;
  failedCount: number;
  totalCount: number;
}

interface UseInventorySocketEventsParams {
  sessionId: string | null;
  onCloseJobUpdated?: (payload: InventoryCloseJobSocketPayload) => void;
  onDisposalInboxUpdated?: (payload: { sessionId: string }) => void;
}

export const useInventorySocketEvents = ({
  sessionId,
  onCloseJobUpdated,
  onDisposalInboxUpdated,
}: UseInventorySocketEventsParams): void => {
  const { isAuthenticated } = useAuth();
  const [tokenRevision, setTokenRevision] = useState(0);

  useEffect(() => subscribeTokenChange(() => setTokenRevision((n) => n + 1)), []);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }
    const token = getAccessToken();
    if (!token) {
      return;
    }
    const socket = getOrCreateNotificationsSocket(token);
    const handleCloseJob = (payload: InventoryCloseJobSocketPayload) => {
      if (sessionId && payload.sessionId !== sessionId) {
        return;
      }
      onCloseJobUpdated?.(payload);
    };
    const handleDisposal = (payload: { sessionId: string }) => {
      if (sessionId && payload.sessionId !== sessionId) {
        return;
      }
      onDisposalInboxUpdated?.(payload);
    };
    socket.on('inventory.close_job.updated', handleCloseJob);
    socket.on('inventory.disposal_inbox.updated', handleDisposal);
    return () => {
      socket.off('inventory.close_job.updated', handleCloseJob);
      socket.off('inventory.disposal_inbox.updated', handleDisposal);
    };
  }, [isAuthenticated, sessionId, onCloseJobUpdated, onDisposalInboxUpdated, tokenRevision]);
};
