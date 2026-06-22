import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDocumentNumber,
  countMonthlySequences,
  parseDocumentSequence,
  sanitizeDocumentNumberForFilename,
} from './document-number.util';

describe('document-number.util', () => {
  it('builds monthly standard and rashod numbers', () => {
    assert.equal(buildDocumentNumber(2026, 1, 1, false), '1-01/2026');
    assert.equal(buildDocumentNumber(2026, 6, 42, false), '42-06/2026');
    assert.equal(buildDocumentNumber(2026, 3, 3, true), 'R/3-03/2026');
  });

  it('parses monthly format sequences', () => {
    assert.equal(parseDocumentSequence('42-06/2026', 2026, 6, false), 42);
    assert.equal(parseDocumentSequence('R/3-03/2026', 2026, 3, true), 3);
    assert.equal(parseDocumentSequence('42-06/2025', 2026, 6, false), null);
    assert.equal(parseDocumentSequence('42-05/2026', 2026, 6, false), null);
  });

  it('parses legacy yearly format for migration compatibility', () => {
    assert.equal(parseDocumentSequence('42/2026', 2026, 1, false), 42);
    assert.equal(parseDocumentSequence('R/3/2026', 2026, 1, true), 3);
  });

  it('counts max monthly sequence including legacy yearly numbers', () => {
    const numbers = ['PRN-2026-0001', '5-06/2026', '12-06/2026'];
    assert.equal(countMonthlySequences(numbers, 2026, 6, false), 12);
  });

  it('sanitizes filename', () => {
    assert.equal(sanitizeDocumentNumberForFilename('42-06/2026'), '42-06-2026');
  });
});
