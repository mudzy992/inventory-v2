import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTransferRawDocumentHtml } from './transfer-raw-document.util';
import {
  assertSafeTransferDocument,
  buildTransferDocumentCsp,
  buildTransferDocumentHeaders,
  extractStyleBlocks,
  resolveTransferDocumentDisposition,
  safeTransferDocumentFilename,
  styleSourceHash,
  verifyTransferDocumentSafety,
} from './transfer-document-security.util';

type TransferFixture = Parameters<typeof buildTransferRawDocumentHtml>[0];

const transfer = (overrides: Record<string, unknown> = {}): TransferFixture =>
  ({
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
    manualPreuzeoLabel: null,
    equipment: {
      inventoryNumber: 'INV-001',
      specifications: {},
      category: { name: '', fields: [], optionalFields: [] },
      stockLot: null,
    },
    ...overrides,
  }) as unknown as TransferFixture;

const html = (overrides: Record<string, unknown> = {}): string =>
  buildTransferRawDocumentHtml(transfer(overrides));

const malicious = '</td><script>alert("xss")</script>&';
const maliciousHtml = () =>
  html({
    type: malicious,
    documentNumber: malicious,
    status: malicious,
    signer: { firstName: malicious, lastName: 'Potpisnik' },
    fromPerson: { firstName: malicious, lastName: 'Pošiljalac' },
    reason: malicious,
    notes: malicious,
    manualPreuzeoLabel: malicious,
    equipment: {
      inventoryNumber: malicious,
      specifications: {},
      category: { name: '', fields: [], optionalFields: [] },
      stockLot: null,
    },
  });

test('the real generated document passes the tag allow-list safety check', () => {
  const document = html();
  assert.deepEqual(verifyTransferDocumentSafety(document), []);
  assert.doesNotThrow(() => assertSafeTransferDocument(document));
  assert.equal(extractStyleBlocks(document).length, 1);
});

test('escaped XSS payloads stay inert even for the strict runtime assertion', () => {
  const document = maliciousHtml();
  assert.equal(document.includes('&lt;script&gt;'), true);
  assert.deepEqual(verifyTransferDocumentSafety(document), []);
  assert.doesNotThrow(() => assertSafeTransferDocument(document));
  assert.doesNotThrow(() => buildTransferDocumentHeaders(document));
});

test('the CSP is derived from the ACTUAL inline style hash, not a constant', () => {
  const document = html();
  const expectedHash = styleSourceHash(extractStyleBlocks(document)[0]!);
  const csp = buildTransferDocumentCsp(document);
  assert.ok(csp.includes(`'sha256-${expectedHash}'`));
  for (const directive of [
    "default-src 'none'",
    "script-src 'none'",
    "img-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    'sandbox',
  ]) {
    assert.ok(csp.includes(directive), `missing ${directive}`);
  }
  const changed = document.replace('margin: 2rem', 'margin: 3rem');
  assert.notEqual(buildTransferDocumentCsp(changed), csp, 'a style change must change the hash');
});

test('multiple style blocks produce multiple hashes; a missing block fails closed', () => {
  const document = html().replace('</head>', '<style>p { color: red; }</style></head>');
  assert.equal(extractStyleBlocks(document).length, 2);
  assert.equal((buildTransferDocumentCsp(document).match(/sha256-/gu) ?? []).length, 2);
  assert.throws(() => buildTransferDocumentCsp('<p>no style</p>'), /without an inline/u);
});

test('unsafe markup is rejected before any header is produced', () => {
  const cases: [string, string][] = [
    ['script tag', html().replace('</body>', '<script>alert(1)</script></body>')],
    ['event handler', html().replace('<body>', '<body onload="alert(1)">')],
    ['image tag', html().replace('</body>', '<img src=x onerror=alert(1)></body>')],
    ['link tag', html().replace('</head>', '<link rel="stylesheet" href="//evil"></head>')],
    ['iframe', html().replace('</body>', '<iframe src="//evil"></iframe></body>')],
    ['base tag', html().replace('</head>', '<base href="//evil"></head>')],
    ['javascript URL', html().replace('<body>', '<body background="javascript:alert(1)">')],
    ['style injection', html().replace('</style>', '}</style><script>x</script><style>{')],
    ['missing doctype', html().replace('<!DOCTYPE html>', '')],
  ];
  for (const [label, document] of cases) {
    assert.ok(verifyTransferDocumentSafety(document).length > 0, `${label} must be rejected`);
    assert.throws(
      () => assertSafeTransferDocument(document),
      /Unsafe generated transfer document/u,
      label,
    );
    assert.throws(() => buildTransferDocumentHeaders(document), /Unsafe generated/u, label);
  }
});

test('headers are complete, no-store, and default to a safe attachment filename', () => {
  const headers = buildTransferDocumentHeaders(html());
  assert.equal(headers['Content-Type'], 'text/html; charset=utf-8');
  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(headers['X-Frame-Options'], 'DENY');
  assert.equal(headers['Referrer-Policy'], 'no-referrer');
  assert.equal(headers['Cache-Control'], 'no-store');
  assert.match(headers['Content-Disposition'], /^attachment; filename="prenosnica-PR-2026-001\.html"$/u);
  assert.match(headers['Content-Security-Policy'], /sandbox/u);
});

test('inline disposition is opt-in and keeps the strict CSP', () => {
  const headers = buildTransferDocumentHeaders(html(), 'inline');
  assert.match(headers['Content-Disposition'], /^inline; filename="/u);
  assert.match(headers['Content-Security-Policy'], /script-src 'none'/u);
});

test('a malicious document number cannot inject into the filename header', () => {
  const headers = buildTransferDocumentHeaders(
    html({ documentNumber: 'PR/2026"\r\nX-Injected: yes' }),
  );
  const disposition = headers['Content-Disposition'];
  assert.equal(disposition.includes('\r'), false);
  assert.equal(disposition.includes('\n'), false);
  assert.equal((disposition.match(/"/gu) ?? []).length, 2, 'exactly one quoted filename');
  assert.match(disposition, /\.html"$/u);
});

test('filename sanitizer handles traversal, unicode, quotes and empty input', () => {
  assert.equal(safeTransferDocumentFilename('../../etc/passwd.html'), 'etc-passwd.html');
  assert.equal(safeTransferDocumentFilename('prenosnica-ŠĐČ.html'), 'prenosnica----.html');
  assert.equal(safeTransferDocumentFilename('"quoted".html'), 'quoted-.html');
  assert.equal(safeTransferDocumentFilename(''), 'prenosnica-raw.html');
  assert.equal(safeTransferDocumentFilename('a'.repeat(200)).length <= 85, true);
});

test('disposition parsing is strict and defaults to attachment', () => {
  assert.equal(resolveTransferDocumentDisposition(undefined), 'attachment');
  assert.equal(resolveTransferDocumentDisposition('  '), 'attachment');
  assert.equal(resolveTransferDocumentDisposition(' INLINE '), 'inline');
  assert.equal(resolveTransferDocumentDisposition('Attachment'), 'attachment');
  for (const bad of ['true', 'download', '1', 'attachment; inline']) {
    assert.throws(() => resolveTransferDocumentDisposition(bad), /must be/u);
  }
});
