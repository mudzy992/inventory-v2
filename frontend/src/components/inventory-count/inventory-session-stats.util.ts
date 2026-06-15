import type {
  InventoryCommitteeDto,
  InventoryLineDto,
  InventorySessionDto,
} from '../../api/inventory-api';

export interface InventorySessionStats {
  recordedLines: number;
  closedCommittees: number;
  totalCommittees: number;
  configuredCommittees: number;
  transferPendingCount: number;
  failedCount: number;
}

export const computeInventorySessionStats = (
  session: InventorySessionDto | null,
  committees: InventoryCommitteeDto[] = [],
  lines: InventoryLineDto[] = [],
): InventorySessionStats => {
  const resolvedCommittees = committees.length > 0 ? committees : (session?.committees ?? []);
  const allLines =
    lines.length > 0
      ? lines
      : resolvedCommittees.flatMap((committee) => committee.lines ?? []);
  return {
    recordedLines: resolvedCommittees.reduce(
      (sum, committee) => sum + (committee._count?.lines ?? committee.lines?.length ?? 0),
      0,
    ),
    closedCommittees: resolvedCommittees.filter((committee) => committee.isClosed).length,
    totalCommittees:
      resolvedCommittees.length > 0
        ? resolvedCommittees.length
        : (session?._count?.committees ?? 0),
    configuredCommittees: resolvedCommittees.filter((committee) => committee.membersConfigured).length,
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
