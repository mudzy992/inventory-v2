import type { TransferType } from '../../../../generated/prisma/client';

export const normalizeManualPreuzeoLabel = (
  type: TransferType,
  value: string | undefined | null,
): string | null => {
  if (type !== 'zaduzenje' && type !== 'razduzenje') {
    return null;
  }
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.slice(0, 255);
};
