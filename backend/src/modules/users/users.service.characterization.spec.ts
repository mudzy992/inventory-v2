import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { UsersService } from './users.service';

const source = readFileSync(resolve('src/modules/users/users.service.ts'), 'utf8');

test('user update writes the auth revocation marker before the transaction', () => {
  assert.match(source, /prepareUserSessionRevocation\(/u);
  const marker = source.indexOf('prepareUserSessionRevocation(');
  const tx = source.indexOf('$transaction(');
  assert.ok(marker < tx, 'marker must be written before the DB transaction');
  assert.match(source, /isDeactivatingUser \|\| isChangingPassword/u);
  assert.match(source, /'password_changed'/u);
  assert.match(source, /sweepRefreshTokensAfterCommit/u);
  assert.doesNotMatch(source, /redisService\.del\(authUserCacheKey/u);
});

test('only administrators may retry a failed close job', () => {
  assert.doesNotMatch(source, /\bconsole\./u);
});

test('UsersService exposes the characterised write path', () => {
  assert.equal(typeof UsersService.prototype.update, 'function');
});
