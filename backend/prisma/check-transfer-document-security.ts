import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertSafeTransferDocument,
  buildTransferDocumentCsp,
  buildTransferDocumentHeaders,
  extractStyleBlocks,
  resolveTransferDocumentDisposition,
  styleSourceHash,
  verifyTransferDocumentSafety,
} from '../src/modules/transfers/utils/transfer-document-security.util';
import { buildTransferRawDocumentHtml } from '../src/modules/transfers/utils/transfer-raw-document.util';

/**
 * CI proof for the last stored-XSS surface: GET /transfers/:id/raw-document
 * returns generated HTML built from business data. Escaping is the primary
 * control; hash-based CSP + tag allow-list + attachment are the second layer.
 */

const ROOT = resolve('.');
const REPO = resolve(ROOT, '..');

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

const staticChecks = (): void => {
  const controller = readFileSync(
    resolve(ROOT, 'src/modules/transfers/transfers.controller.ts'),
    'utf8',
  );
  for (const expected of [
    '@Res({ passthrough: true })',
    'buildTransferDocumentHeaders(',
    'resolveTransferDocumentDisposition(',
    'TRANSFER_RAW_DOCUMENT_DISPOSITION',
  ]) {
    assert.ok(controller.includes(expected), `controller must use ${expected}`);
  }
  assert.doesNotMatch(
    controller,
    /@Header\('Content-Type',\s*'text\/html/u,
    'the raw document must not rely on a bare Content-Type decorator',
  );

  const builder = readFileSync(
    resolve(ROOT, 'src/modules/transfers/utils/transfer-raw-document.util.ts'),
    'utf8',
  );
  assert.match(builder, /escapeHtmlText\(/u, 'business values must still be escaped');

  for (const file of ['.env.example', 'docker-compose.yml', 'docker-compose.prod.yml']) {
    assert.match(
      readFileSync(resolve(REPO, file), 'utf8'),
      /TRANSFER_RAW_DOCUMENT_DISPOSITION/u,
      `${file} must expose the disposition policy`,
    );
  }
  const readiness = readFileSync(
    resolve(REPO, 'scripts/check-deployment-readiness.mjs'),
    'utf8',
  );
  assert.ok(readiness.includes('TRANSFER_RAW_DOCUMENT_DISPOSITION'));
  const guide = readFileSync(resolve(REPO, 'docs/transfer-document-security.md'), 'utf8');
  for (const keyword of ['CSP', 'sandbox', 'attachment', 'escaping', 'inline']) {
    assert.ok(guide.includes(keyword), `guide must document ${keyword}`);
  }
};

const runtimeChecks = (): void => {
  const payload = '</td><script>alert("xss")</script>&';
  const hostile = buildTransferRawDocumentHtml(
    transfer({
      type: payload,
      documentNumber: payload,
      status: payload,
      signer: { firstName: payload, lastName: 'Potpisnik' },
      fromPerson: { firstName: payload, lastName: 'Pošiljalac' },
      reason: payload,
      notes: payload,
      manualPreuzeoLabel: payload,
      equipment: {
        inventoryNumber: payload,
        specifications: {},
        category: { name: '', fields: [], optionalFields: [] },
        stockLot: null,
      },
    }),
  );
  assert.equal(hostile.includes('&lt;script&gt;'), true, 'escaping must remain intact');
  assert.doesNotMatch(hostile, /<script\b/iu);
  assert.deepEqual(verifyTransferDocumentSafety(hostile), []);
  assert.doesNotThrow(() => assertSafeTransferDocument(hostile));

  const headers = buildTransferDocumentHeaders(hostile);
  assert.equal(headers['Content-Type'], 'text/html; charset=utf-8');
  assert.match(headers['Content-Disposition'], /^attachment; filename="/u);
  assert.equal(headers['Cache-Control'], 'no-store');
  assert.equal(headers['X-Frame-Options'], 'DENY');

  const style = extractStyleBlocks(hostile)[0]!;
  assert.ok(headers['Content-Security-Policy'].includes(`'sha256-${styleSourceHash(style)}'`));
  for (const directive of ["default-src 'none'", "script-src 'none'", 'sandbox', "frame-ancestors 'none'"]) {
    assert.ok(headers['Content-Security-Policy'].includes(directive));
  }

  // Mutation 1: an injected script must fail the runtime assertion.
  const injected = hostile.replace('</body>', '<script>alert(1)</script></body>');
  assert.ok(verifyTransferDocumentSafety(injected).length > 0);
  assert.throws(() => buildTransferDocumentHeaders(injected), /Unsafe generated/u);

  // Mutation 2: removing the style block must break CSP generation (no drift).
  assert.throws(
    () => buildTransferDocumentCsp(hostile.replace(/<style>[\s\S]*?<\/style>/iu, '')),
    /without an inline/u,
  );

  // Mutation 3: a stylesheet change must produce a different CSP hash.
  assert.notEqual(
    buildTransferDocumentCsp(hostile.replace('margin: 2rem', 'margin: 9rem')),
    headers['Content-Security-Policy'],
  );

  // Mutation 4: inline mode keeps every security header.
  const inlineHeaders = buildTransferDocumentHeaders(hostile, 'inline');
  assert.match(inlineHeaders['Content-Disposition'], /^inline; filename="/u);
  assert.match(inlineHeaders['Content-Security-Policy'], /sandbox/u);
  assert.equal(resolveTransferDocumentDisposition(undefined), 'attachment');
  assert.throws(() => resolveTransferDocumentDisposition('download'), /must be/u);

  // Mutation 5: header injection through a document number is neutralised.
  const injectedName = buildTransferDocumentHeaders(
    buildTransferRawDocumentHtml(transfer({ documentNumber: 'PR/2026"\r\nX-Evil: 1' })),
  )['Content-Disposition'];
  assert.equal(injectedName.includes('\r'), false);
  assert.equal(injectedName.includes('\n'), false);
};

try {
  staticChecks();
  runtimeChecks();
  console.log(
    'Transfer document security check passed (escaping + tag allow-list, hash-based CSP with sandbox, attachment default, no-store, 5 mutations rejected).',
  );
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
