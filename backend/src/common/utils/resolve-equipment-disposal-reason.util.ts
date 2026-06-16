import type { EquipmentDisposalListStatus, EquipmentStatus, Prisma } from '../../../generated/prisma/client';

const ACTIVE_DISPOSAL_LIST_STATUSES: EquipmentDisposalListStatus[] = [
  'listed',
  'assigned',
  'approved',
];

type PrismaClientLike = {
  equipmentDisposalListItem: {
    findFirst: (args: Prisma.EquipmentDisposalListItemFindFirstArgs) => Promise<{ note: string | null } | null>;
    findMany: (args: Prisma.EquipmentDisposalListItemFindManyArgs) => Promise<Array<{ equipmentId: string; note: string | null }>>;
  };
};

export const resolveEquipmentDisposalReason = async (
  prisma: PrismaClientLike,
  equipmentId: string,
  status: EquipmentStatus,
  equipmentNotes?: string | null,
): Promise<string | null> => {
  if (status === 'za_rashod') {
    const item = await prisma.equipmentDisposalListItem.findFirst({
      where: {
        equipmentId,
        status: { in: ACTIVE_DISPOSAL_LIST_STATUSES },
      },
      orderBy: { markedAt: 'desc' },
      select: { note: true },
    });
    return item?.note?.trim() || null;
  }
  if (status === 'rashodovano') {
    const item = await prisma.equipmentDisposalListItem.findFirst({
      where: { equipmentId, status: 'approved' },
      orderBy: { markedAt: 'desc' },
      select: { note: true },
    });
    const fromList = item?.note?.trim();
    if (fromList) {
      return fromList;
    }
    return equipmentNotes?.trim() || null;
  }
  return null;
};

export const resolveEquipmentDisposalReasonsBatch = async (
  prisma: PrismaClientLike,
  rows: Array<{ id: string; status: EquipmentStatus; notes?: string | null }>,
): Promise<Map<string, string>> => {
  const result = new Map<string, string>();
  const zaRashodIds = rows.filter((row) => row.status === 'za_rashod').map((row) => row.id);
  const rashodovanoIds = rows.filter((row) => row.status === 'rashodovano').map((row) => row.id);
  if (zaRashodIds.length > 0) {
    const items = await prisma.equipmentDisposalListItem.findMany({
      where: {
        equipmentId: { in: zaRashodIds },
        status: { in: ACTIVE_DISPOSAL_LIST_STATUSES },
      },
      orderBy: { markedAt: 'desc' },
      select: { equipmentId: true, note: true },
    });
    for (const item of items) {
      const note = item.note?.trim();
      if (note && !result.has(item.equipmentId)) {
        result.set(item.equipmentId, note);
      }
    }
  }
  if (rashodovanoIds.length > 0) {
    const items = await prisma.equipmentDisposalListItem.findMany({
      where: {
        equipmentId: { in: rashodovanoIds },
        status: 'approved',
      },
      orderBy: { markedAt: 'desc' },
      select: { equipmentId: true, note: true },
    });
    const notesByEquipmentId = new Map(
      rashodovanoIds.map((id) => [id, rows.find((row) => row.id === id)?.notes?.trim() || '']),
    );
    for (const item of items) {
      const note = item.note?.trim();
      if (note && !result.has(item.equipmentId)) {
        result.set(item.equipmentId, note);
      }
    }
    for (const id of rashodovanoIds) {
      if (!result.has(id)) {
        const fallback = notesByEquipmentId.get(id);
        if (fallback) {
          result.set(id, fallback);
        }
      }
    }
  }
  return result;
};
