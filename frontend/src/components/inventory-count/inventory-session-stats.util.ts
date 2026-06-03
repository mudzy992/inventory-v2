import type { InventoryLineDto, InventorySessionDto } from '../../api/inventory-api';

export interface InventorySessionStats {
  recordedLines: number;
  closedCommittees: number;
  totalCommittees: number;
  transferPendingCount: number;
  failedCount: number;
}

export const computeInventorySessionStats = (
  session: InventorySessionDto | null,
): InventorySessionStats => {
  const committees = session?.committees ?? [];
  const allLines = committees.flatMap((committee) => committee.lines ?? []);
  return {
    recordedLines: allLines.length,
    closedCommittees: committees.filter((committee) => committee.isClosed).length,
    totalCommittees: committees.length,
    transferPendingCount: allLines.filter((line) => isTransferPending(line)).length,
    failedCount: allLines.filter((line) => line.pendingAction?.status === 'failed').length,
  };
};

export const isTransferPending = (line: InventoryLineDto): boolean => {
  const transfer = line.generatedTransfer;
  if (!transfer) {
    return false;
  }
  return transfer.status !== 'potpisan' || !transfer.scannedDocUrl;
};

export const isLineUnrecorded = (
  equipmentId: string,
  lineByEquipment: Map<string, InventoryLineDto>,
): boolean => !lineByEquipment.has(equipmentId);
