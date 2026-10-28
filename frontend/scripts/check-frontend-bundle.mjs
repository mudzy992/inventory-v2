#!/usr/bin/env node
/**
 * Dependency-free bundle budget gate. Run AFTER `npm run build` so it measures
 * the real dist/ output (raw + gzip) instead of a warning threshold in Vite.
 *
 *   node scripts/check-frontend-bundle.mjs
 *   node scripts/check-frontend-bundle.mjs --json
 *
 * Budgets are ~8-10% above the measured baseline of the redesigned build, so
 * ordinary changes pass but a new heavy dependency or an accidentally
 * de-optimized chunk fails CI before it reaches users.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const ASSETS = join(ROOT, 'dist', 'assets');

const BUDGET = {
  maxChunkRawKb: 520,
  maxChunkGzipKb: 168,
  totalJsRawKb: 1850,
  totalJsGzipKb: 575,
  totalCssRawKb: 130,
  totalCssGzipKb: 24,
  entryRawKb: 150,
  // Component-specific budget extensions (Module B)
  maxTransferPanelChunkRawKb: 500,
  maxTransferPanelChunkGzipKb: 160,
  maxQrScannerChunkRawKb: 200,
  maxQrScannerChunkGzipKb: 65,
};

const kb = (bytes) => Math.round((bytes / 1024) * 10) / 10;

const measure = (dir, extension) =>
  readdirSync(dir)
    .filter((name) => name.endsWith(extension))
    .map((name) => {
      const content = readFileSync(join(dir, name));
      return { name, raw: statSync(join(dir, name)).size, gzip: gzipSync(content).length };
    });

const main = () => {
  assert.ok(existsSync(ASSETS), 'dist/assets is missing — run `npm run build` first');
  const js = measure(ASSETS, '.js');
  const css = measure(ASSETS, '.css');
  assert.ok(js.length > 10, `expected lazy chunks, found ${js.length} JS files`);
  assert.ok(css.length >= 1, 'expected at least one CSS asset');

  const sum = (files, key) => files.reduce((total, file) => total + file[key], 0);
  const largest = [...js].sort((a, b) => b.raw - a.raw)[0];
  const largestGzip = [...js].sort((a, b) => b.gzip - a.gzip)[0];
  const entries = js.filter((file) => /^index-[A-Za-z0-9_-]+\.js$/u.test(file.name));
  assert.equal(entries.length, 1, 'expected exactly one application entry chunk');

  const actual = {
    files: js.length,
    largestChunk: largest.name,
    maxChunkRawKb: kb(largest.raw),
    maxChunkGzipKb: kb(largestGzip.gzip),
    totalJsRawKb: kb(sum(js, 'raw')),
    totalJsGzipKb: kb(sum(js, 'gzip')),
    totalCssRawKb: kb(sum(css, 'raw')),
    totalCssGzipKb: kb(sum(css, 'gzip')),
    entryRawKb: kb(entries[0].raw),
  };

  const baseBudgetKeys = Object.keys(BUDGET).filter(
    (k) => !k.includes('TransferPanel') && !k.includes('QrScanner')
  );
  for (const key of baseBudgetKeys) {
    const limit = BUDGET[key];
    assert.ok(
      actual[key] <= limit,
      `${key}: ${actual[key]} kB exceeds the ${limit} kB budget`,
    );
  }

  // Component-specific budget checks (Module B)
  const transferPanelChunk = js.find((file) => file.name.includes('TransferDocumentPanel') || file.name.includes('transfer-document'));
  const qrScannerChunk = js.find((file) => file.name.includes('QRScannerPage') || file.name.includes('qr-scanner'));
  if (transferPanelChunk) {
    assert.ok(
      kb(transferPanelChunk.raw) <= BUDGET.maxTransferPanelChunkRawKb,
      `TransferDocumentPanel chunk ${transferPanelChunk.name} exceeds budget: ${kb(transferPanelChunk.raw)} kB raw`,
    );
    assert.ok(
      kb(transferPanelChunk.gzip) <= BUDGET.maxTransferPanelChunkGzipKb,
      `TransferDocumentPanel chunk gzip exceeds budget: ${kb(transferPanelChunk.gzip)} kB gzip`,
    );
  } else {
    console.log('Note: TransferDocumentPanel chunk not found separately (included in larger chunk); budget check skipped.');
  }
  if (qrScannerChunk) {
    assert.ok(
      kb(qrScannerChunk.raw) <= BUDGET.maxQrScannerChunkRawKb,
      `QRScannerPage chunk ${qrScannerChunk.name} exceeds budget: ${kb(qrScannerChunk.raw)} kB raw`,
    );
    assert.ok(
      kb(qrScannerChunk.gzip) <= BUDGET.maxQrScannerChunkGzipKb,
      `QRScannerPage chunk gzip exceeds budget: ${kb(qrScannerChunk.gzip)} kB gzip`,
    );
  } else {
    console.log('Note: QRScannerPage chunk not found separately (included in larger chunk); budget check skipped.');
  }

  if (process.argv.includes('--json')) console.log(JSON.stringify({ pass: true, budget: BUDGET, actual }, null, 2));
  else
    console.log(
      `Frontend bundle budget passed (${actual.files} chunks, largest ${actual.largestChunk} ` +
        `${actual.maxChunkRawKb} kB raw / ${actual.maxChunkGzipKb} kB gzip, ` +
        `total ${actual.totalJsRawKb} kB raw / ${actual.totalJsGzipKb} kB gzip, ` +
        `CSS ${actual.totalCssRawKb} kB raw / ${actual.totalCssGzipKb} kB gzip).`,
    );
};

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
