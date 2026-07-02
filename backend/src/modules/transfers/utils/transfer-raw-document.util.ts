import type { Prisma } from '../../../../generated/prisma/client';
import { resolvePreuzeoLabel } from './build-transfer-template-data.util';

type TransferForDocument = Prisma.TransferGetPayload<{
  include: {
    equipment: true;
    signer: true;
    fromPerson: true;
    toPerson: true;
    fromWarehouse: true;
    toWarehouse: true;
  };
}>;

export const buildTransferRawDocumentHtml = (transfer: TransferForDocument): string => {
  const signerName = `${transfer.signer.firstName} ${transfer.signer.lastName}`;
  const fromLabel =
    transfer.fromPerson != null
      ? `${transfer.fromPerson.firstName} ${transfer.fromPerson.lastName}`
      : transfer.fromType;
  const toLabel = resolvePreuzeoLabel({
    documentNumber: transfer.documentNumber,
    reason: transfer.reason,
    notes: transfer.notes,
    fromType: transfer.fromType,
    toType: transfer.toType,
    manualPreuzeoLabel: transfer.manualPreuzeoLabel,
    signer: transfer.signer,
    fromPerson: transfer.fromPerson,
    toPerson: transfer.toPerson,
    fromWarehouse: transfer.fromWarehouse,
    toWarehouse: transfer.toWarehouse,
    equipment: {
      inventoryNumber: transfer.equipment.inventoryNumber,
      specifications: transfer.equipment.specifications,
      category: { name: '', fields: [], optionalFields: [] },
      stockLot: null,
    },
  });
  return `<!DOCTYPE html>
<html lang="bs">
<head>
  <meta charset="utf-8" />
  <title>Prenosnica ${transfer.documentNumber}</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem; color: #111; }
    h1 { font-size: 1.25rem; margin-bottom: 0.5rem; }
    table { width: 100%; border-collapse: collapse; margin-top: 1.5rem; }
    td, th { border: 1px solid #ccc; padding: 0.5rem 0.75rem; text-align: left; }
    th { background: #f4f4f5; width: 35%; }
  </style>
</head>
<body>
  <h1>Prenosnica (RAW) — ${transfer.type}</h1>
  <p>Broj dokumenta: <strong>${transfer.documentNumber}</strong></p>
  <p>Status: ${transfer.status}</p>
  <table>
    <tr><th>Inventurni broj</th><td>${transfer.equipment.inventoryNumber}</td></tr>
    <tr><th>Datum</th><td>${transfer.date.toISOString().slice(0, 10)}</td></tr>
    <tr><th>Predao / iz</th><td>${fromLabel}</td></tr>
    <tr><th>Preuzeo / u</th><td>${toLabel}</td></tr>
    <tr><th>Ovjerio</th><td>${signerName}</td></tr>
    ${transfer.reason ? `<tr><th>Razlog</th><td>${transfer.reason}</td></tr>` : ''}
    ${transfer.notes ? `<tr><th>Napomena</th><td>${transfer.notes}</td></tr>` : ''}
  </table>
</body>
</html>`;
};
