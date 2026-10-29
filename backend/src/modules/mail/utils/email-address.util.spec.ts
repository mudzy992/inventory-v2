import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findInvalidEmailAddress,
  isValidEmailAddress,
  parseEmailAddressList,
} from './email-address.util';

test('parses comma/semicolon lists, trims and dedupes case-insensitively', () => {
  assert.deepEqual(parseEmailAddressList(' a@firma.ba, b@firma.ba; A@Firma.ba ,'), [
    'a@firma.ba',
    'b@firma.ba',
  ]);
  assert.deepEqual(parseEmailAddressList(''), []);
  assert.deepEqual(parseEmailAddressList(null), []);
  assert.deepEqual(parseEmailAddressList(undefined), []);
});

test('validates basic email shape', () => {
  assert.equal(isValidEmailAddress('ime.prezime@firma.ba'), true);
  assert.equal(isValidEmailAddress('bez-et.ba'), false);
  assert.equal(isValidEmailAddress('a@b'), false);
  assert.equal(isValidEmailAddress('a b@c.ba'), false);
});

test('findInvalidEmailAddress returns the first invalid entry', () => {
  assert.equal(findInvalidEmailAddress(['ok@firma.ba', 'lose', 'takodje-lose']), 'lose');
  assert.equal(findInvalidEmailAddress(['ok@firma.ba']), null);
});
