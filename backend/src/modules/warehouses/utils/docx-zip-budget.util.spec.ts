import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getDocxZipBudgetError,
  getDocxZipEntryCountError,
  type ZipEntryBudget,
} from './docx-zip-budget.util';

const entry = (overrides: Partial<ZipEntryBudget> = {}): ZipEntryBudget => ({
  name: 'word/document.xml',
  isDirectory: false,
  compressedBytes: 100,
  uncompressedBytes: 5_000,
  ...overrides,
});

test('rejects excessive entry counts from the ZIP directory before parsing entries', () => {
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(2_001, 8);
  endRecord.writeUInt16LE(2_001, 10);

  assert.match(getDocxZipEntryCountError(endRecord) ?? '', /previše datoteka/);
});

test('accepts a normal DOCX archive and ignores directory entries', () => {
  assert.equal(
    getDocxZipBudgetError([
      entry(),
      entry({ name: 'word/', isDirectory: true, compressedBytes: 0, uncompressedBytes: 0 }),
    ]),
    undefined,
  );
});

test('rejects archives with too many entries', () => {
  const entries = Array.from({ length: 2_001 }, (_, index) =>
    entry({ name: `file-${index}`, compressedBytes: 1, uncompressedBytes: 1 }),
  );
  assert.match(getDocxZipBudgetError(entries) ?? '', /previše datoteka/);
});

test('rejects excessive per-entry and aggregate uncompressed sizes', () => {
  assert.match(
    getDocxZipBudgetError([entry({ compressedBytes: 1, uncompressedBytes: 64 * 1024 * 1024 + 1 })]) ?? '',
    /prelazi dozvoljenu veličinu/,
  );

  const largeEntries = Array.from({ length: 3 }, (_, index) =>
    entry({
      name: `file-${index}`,
      compressedBytes: 1_000_000,
      uncompressedBytes: 48 * 1024 * 1024,
    }),
  );
  assert.match(getDocxZipBudgetError(largeEntries) ?? '', /Ukupna raspakovana veličina/);
});

test('rejects extreme compression ratios and malformed size metadata', () => {
  assert.match(
    getDocxZipBudgetError([entry({ compressedBytes: 100, uncompressedBytes: 10_001 })]) ?? '',
    /omjer kompresije/,
  );
  assert.match(
    getDocxZipBudgetError([entry({ compressedBytes: Number.NaN })]) ?? '',
    /neispravne podatke o veličini/,
  );
});
