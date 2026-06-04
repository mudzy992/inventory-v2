import type { Prisma } from '../../../../generated/prisma/client';

type TransferForTemplate = {
  documentNumber: string;
  reason: string | null;
  notes: string | null;
  fromType: string;
  toType: string;
  signer: { firstName: string; lastName: string };
  fromPerson: { firstName: string; lastName: string } | null;
  toPerson: { firstName: string; lastName: string } | null;
  fromWarehouse: { name: string } | null;
  toWarehouse: { name: string } | null;
  equipment: {
    inventoryNumber: string;
    category: { name: string };
    specifications: Prisma.JsonValue;
  };
};

const formatPerson = (person: { firstName: string; lastName: string } | null): string =>
  person ? `${person.firstName} ${person.lastName}`.trim() : '';

const formatParty = (
  type: string,
  person: { firstName: string; lastName: string } | null,
  warehouse: { name: string } | null,
): string => {
  if (type === 'skladiste' && warehouse) {
    return `Skladište: ${warehouse.name}`;
  }
  if (type === 'rashod') {
    return 'Rashod';
  }
  const label = formatPerson(person);
  return label || type;
};

const buildEquipmentLabel = (transfer: TransferForTemplate): string => {
  const specs = (transfer.equipment.specifications ?? {}) as Record<string, string>;
  const specParts = Object.values(specs).filter(Boolean).slice(0, 3);
  const suffix = specParts.length > 0 ? ` — ${specParts.join(', ')}` : '';
  return `${transfer.equipment.category.name}${suffix}`;
};

export const buildTransferTemplateData = (
  transfer: TransferForTemplate,
): Record<string, string> => {
  const obrazlozenje = [transfer.reason, transfer.notes].filter(Boolean).join('\n');
  return {
    broj_prenosnice: transfer.documentNumber,
    predao: formatParty(transfer.fromType, transfer.fromPerson, transfer.fromWarehouse),
    preuzeo: formatParty(transfer.toType, transfer.toPerson, transfer.toWarehouse),
    potpisnik: formatPerson(transfer.signer),
    inv_broj: transfer.equipment.inventoryNumber,
    naziv_opreme: buildEquipmentLabel(transfer),
    obrazlozenje: obrazlozenje || '—',
  };
};
