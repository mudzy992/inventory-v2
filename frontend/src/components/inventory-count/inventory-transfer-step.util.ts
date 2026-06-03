import type { InventorySessionStatus } from '../../api/inventory-api';
import type { TransferRecord } from '../../types';

export type InventoryTransferStepId = 'raw' | 'upload' | 'await_close' | 'applied';

export interface InventoryTransferStepState {
  id: InventoryTransferStepId;
  label: string;
  index: number;
  isComplete: boolean;
  isCurrent: boolean;
}

const INVENTORY_TRANSFER_STEPS: { id: InventoryTransferStepId; label: string }[] = [
  { id: 'raw', label: 'RAW' },
  { id: 'upload', label: 'Upload' },
  { id: 'await_close', label: 'Čeka zatvaranje' },
  { id: 'applied', label: 'Primijenjeno' },
];

export const resolveInventoryTransferStepId = (
  transfer: TransferRecord,
  sessionStatus: InventorySessionStatus,
  lineApplied?: boolean,
): InventoryTransferStepId => {
  if (transfer.status === 'potpisan' || lineApplied) {
    return 'applied';
  }
  const hasUpload = Boolean(transfer.scannedDocUrl) || transfer.status === 'uploaded';
  if (hasUpload && sessionStatus === 'active') {
    return 'await_close';
  }
  if (hasUpload) {
    return 'applied';
  }
  if (transfer.status === 'raw' || transfer.status === 'printed') {
    return 'raw';
  }
  return 'upload';
};

export const buildInventoryTransferSteps = (
  transfer: TransferRecord,
  sessionStatus: InventorySessionStatus,
  lineApplied?: boolean,
): InventoryTransferStepState[] => {
  const currentId = resolveInventoryTransferStepId(transfer, sessionStatus, lineApplied);
  const currentIndex = INVENTORY_TRANSFER_STEPS.findIndex((step) => step.id === currentId);
  return INVENTORY_TRANSFER_STEPS.map((step, index) => ({
    id: step.id,
    label: step.label,
    index,
    isComplete: index < currentIndex || (index === currentIndex && currentId === 'applied'),
    isCurrent: step.id === currentId,
  }));
};

export const getInventoryTransferBadge = (
  transfer: TransferRecord,
  sessionStatus: InventorySessionStatus,
  lineApplied?: boolean,
): { label: string; tone: 'warning' | 'success' | 'info' } => {
  const stepId = resolveInventoryTransferStepId(transfer, sessionStatus, lineApplied);
  if (stepId === 'raw') {
    return { label: 'Nema uploada', tone: 'warning' };
  }
  if (stepId === 'upload') {
    return { label: 'Nema uploada', tone: 'warning' };
  }
  if (stepId === 'await_close') {
    return { label: 'Upload OK, čeka zatvaranje', tone: 'info' };
  }
  return { label: 'Primijenjeno', tone: 'success' };
};
