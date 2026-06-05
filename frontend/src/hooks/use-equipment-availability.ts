import { useEffect, useState } from 'react';
import {
  checkInventoryNumberAvailableApi,
  checkSpecificationValueAvailableApi,
} from '../api/equipment-availability-api';

export type AvailabilityStatus = 'idle' | 'empty' | 'checking' | 'available' | 'taken';

const DEBOUNCE_MS = 400;

export const useInventoryNumberAvailability = (value: string): AvailabilityStatus => {
  const [status, setStatus] = useState<AvailabilityStatus>('idle');

  useEffect(() => {
    const trimmed = value.trim();
    if (!trimmed) {
      setStatus('empty');
      return;
    }

    setStatus('checking');
    const timer = window.setTimeout(() => {
      void checkInventoryNumberAvailableApi(trimmed)
        .then((result) => setStatus(result.available ? 'available' : 'taken'))
        .catch(() => setStatus('idle'));
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [value]);

  return status;
};

export const useSpecificationValueAvailability = (
  categoryId: string | undefined,
  fieldId: string,
  value: string,
): AvailabilityStatus => {
  const [status, setStatus] = useState<AvailabilityStatus>('idle');

  useEffect(() => {
    const trimmed = value.trim();
    if (!categoryId || !fieldId || !trimmed) {
      setStatus(trimmed ? 'idle' : 'empty');
      return;
    }

    setStatus('checking');
    const timer = window.setTimeout(() => {
      void checkSpecificationValueAvailableApi(categoryId, fieldId, trimmed)
        .then((result) => setStatus(result.available ? 'available' : 'taken'))
        .catch(() => setStatus('idle'));
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [categoryId, fieldId, value]);

  return status;
};

export const isAvailabilityBlocking = (status: AvailabilityStatus): boolean =>
  status === 'checking' || status === 'taken';
