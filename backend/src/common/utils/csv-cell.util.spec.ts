import assert from 'node:assert/strict';
import test from 'node:test';
import { escapeCsvCell } from './csv-cell.util';

test('quotes CSV delimiters, quotes, and line breaks', () => {
  assert.equal(escapeCsvCell('plain text'), 'plain text');
  assert.equal(escapeCsvCell('a,b'), '"a,b"');
  assert.equal(escapeCsvCell('say "hi"'), '"say ""hi"""');
  assert.equal(escapeCsvCell('line 1\r\nline 2'), '"line 1\r\nline 2"');
  assert.equal(escapeCsvCell(null), '');
});

test('neutralizes spreadsheet formula prefixes after leading whitespace', () => {
  for (const payload of ['=1+1', '+1+1', '-1+1', '@SUM(A1:A2)', '\t=1+1', '  =1+1', '\ufeff=1+1']) {
    assert.equal(escapeCsvCell(payload), `'${payload}`);
  }
  assert.equal(escapeCsvCell('ordinary - text'), 'ordinary - text');
});
