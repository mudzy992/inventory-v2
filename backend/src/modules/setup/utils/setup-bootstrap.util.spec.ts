import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { slugifyCatalogCode, collectUsernames } from './setup-bootstrap.util';

describe('setup-bootstrap.util', () => {
  describe('slugifyCatalogCode', () => {
    it('normalizes diacritics and spaces', () => {
      const actual = slugifyCatalogCode('Računar opšte');
      assert.equal(actual, 'RACUNAR-OPSTE');
    });

    it('returns fallback for empty input', () => {
      assert.equal(slugifyCatalogCode('---'), 'STAVKA-001');
    });
  });

  describe('collectUsernames', () => {
    it('returns trimmed usernames when unique', () => {
      const actual = collectUsernames([' admin ', 'evidenticar']);
      assert.deepEqual(actual, ['admin', 'evidenticar']);
    });

    it('throws on duplicate usernames case-insensitive', () => {
      assert.throws(() => collectUsernames(['Admin', 'admin']), /DUPLICATE_USERNAME/);
    });
  });
});
