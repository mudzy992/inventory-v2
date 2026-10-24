import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTransferRawDocumentHtml } from './transfer-raw-document.util';

test('buildTransferRawDocumentHtml escapes business values as HTML text', () => {
  const payload = '</td><script>alert("xss")</script>&';
  const html = buildTransferRawDocumentHtml({
    type: payload,
    documentNumber: payload,
    status: payload,
    date: new Date('2026-10-24T00:00:00.000Z'),
    signer: { firstName: payload, lastName: 'Potpisnik' },
    fromPerson: { firstName: payload, lastName: 'Pošiljalac' },
    fromType: 'user',
    toPerson: null,
    toType: 'user',
    manualPreuzeoLabel: payload,
    fromWarehouse: null,
    toWarehouse: null,
    reason: payload,
    notes: payload,
    equipment: {
      inventoryNumber: payload,
      specifications: {},
      category: { name: '', fields: [], optionalFields: [] },
      stockLot: null,
    },
  } as unknown as Parameters<typeof buildTransferRawDocumentHtml>[0]);

  const escapedPayload = '&lt;/td&gt;&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;&amp;';
  assert.ok(html.includes(escapedPayload));
  assert.doesNotMatch(html, /<script>/i);
  assert.equal((html.match(/<\/td>/gi) ?? []).length, 7);
});

test('escape remains local to dynamic content and preserves the print document', () => {
  const html = buildTransferRawDocumentHtml({
    type: 'zaduženje',
    documentNumber: 'PR-2026-001',
    status: 'potpisano',
    date: new Date('2026-10-24T00:00:00.000Z'),
    signer: { firstName: 'Amina', lastName: 'Kovač' },
    fromPerson: null,
    fromType: 'user',
    toPerson: null,
    toType: 'skladiste',
    fromWarehouse: null,
    toWarehouse: { name: 'Glavno skladište' },
    reason: null,
    notes: null,
    equipment: {
      inventoryNumber: 'INV-001',
      specifications: {},
      category: { name: '', fields: [], optionalFields: [] },
      stockLot: null,
    },
  } as unknown as Parameters<typeof buildTransferRawDocumentHtml>[0]);

  assert.match(html, /<html lang="bs">/);
  assert.match(html, /PR-2026-001/);
  assert.match(html, /Skladište: Glavno skladište/);
  assert.match(html, /Amina Kovač/);
  assert.match(html, /INV-001/);
});
