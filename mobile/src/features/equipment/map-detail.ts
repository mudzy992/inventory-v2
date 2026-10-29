import type { Equipment, PublicEquipment, TransferRecord } from '@/types/models';

const fullName = (row?: { firstName: string; lastName: string } | null): string =>
  row ? `${row.firstName} ${row.lastName}` : '—';

export const toPublicLike = (equipment: Equipment, transfers: TransferRecord[]): PublicEquipment => ({
  id: equipment.id,
  inventoryNumber: equipment.inventoryNumber,
  isAccountingTracked: equipment.isAccountingTracked,
  status: equipment.status,
  categoryName: equipment.category?.name ?? 'Oprema',
  productName: equipment.stockLot?.productName ?? equipment.category?.name ?? null,
  uniqueFields: Object.entries(equipment.specifications ?? {})
    .filter(([, value]) => Boolean(value))
    .slice(0, 4)
    .map(([label, value]) => ({ label, value })),
  specifications: equipment.specifications ?? {},
  currentHolder: equipment.currentHolder
    ? {
        fullName: fullName(equipment.currentHolder),
        title: equipment.currentHolder.title,
        orgUnitPath: '',
      }
    : null,
  warehouse: equipment.warehouse ? { name: equipment.warehouse.name } : null,
  movements: transfers.map((row) => ({
    date: row.date,
    type: row.type,
    status: row.status,
    fromLabel: fullName(row.fromPerson),
    toLabel: fullName(row.toPerson),
    documentNumber: row.documentNumber,
  })),
  disposalReason: equipment.disposalReason ?? null,
});
