import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDocumentNumber,
  countYearlySequences,
  parseDocumentSequence,
  sanitizeDocumentNumberForFilename,
} from './document-number.util';

describe('document-number.util', () => {
  it('builds standard and rashod numbers', () => {
    assert.equal(buildDocumentNumber(2026, 42, false), '42/2026');
    assert.equal(buildDocumentNumber(2026, 3, true), 'R/3/2026');
  });

  it('parses new format sequences', () => {
    assert.equal(parseDocumentSequence('42/2026', 2026, false), 42);
    assert.equal(parseDocumentSequence('R/3/2026', 2026, true), 3);
    assert.equal(parseDocumentSequence('42/2025', 2026, false), null);
  });

  it('counts max sequence including legacy', () => {
    const numbers = ['PRN-2026-0001', '5/2026', '12/2026'];
    assert.equal(countYearlySequences(numbers, 2026, false), 12);
  });

  it('sanitizes filename', () => {
    assert.equal(sanitizeDocumentNumberForFilename('42/2026'), '42-2026');
  });
});
