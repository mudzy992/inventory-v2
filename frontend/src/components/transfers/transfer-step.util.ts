import type { TransferRecord } from '../../types';

export type TransferStepId = 'raw' | 'upload' | 'signed';

export interface TransferStepState {
  id: TransferStepId;
  label: string;
  index: number;
  isComplete: boolean;
  isCurrent: boolean;
}

const TRANSFER_STEPS: { id: TransferStepId; label: string }[] = [
  { id: 'raw', label: 'RAW' },
  { id: 'upload', label: 'Upload' },
  { id: 'signed', label: 'Potpisano' },
];

export const resolveTransferStepId = (transfer: TransferRecord): TransferStepId => {
  if (transfer.status === 'potpisan') {
    return 'signed';
  }
  if (transfer.scannedDocUrl || transfer.status === 'uploaded') {
    return 'upload';
  }
  return 'raw';
};

export const buildTransferSteps = (transfer: TransferRecord): TransferStepState[] => {
  const currentId = resolveTransferStepId(transfer);
  const currentIndex = TRANSFER_STEPS.findIndex((step) => step.id === currentId);
  return TRANSFER_STEPS.map((step, index) => ({
    id: step.id,
    label: step.label,
    index,
    isComplete: index < currentIndex || (index === currentIndex && currentId === 'signed'),
    isCurrent: step.id === currentId,
  }));
};

export const getTransferStepBadge = (
  transfer: TransferRecord,
): { label: string; tone: 'warning' | 'success' | 'info' } => {
  const stepId = resolveTransferStepId(transfer);
  if (stepId === 'raw') {
    return { label: 'Čeka upload', tone: 'warning' };
  }
  if (stepId === 'upload') {
    return { label: 'Upload OK, čeka potpis', tone: 'info' };
  }
  return { label: 'Potpisano', tone: 'success' };
};
