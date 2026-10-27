import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  AUTH_SESSION_RATE_LIMIT_POLICY,
  LOGIN_RATE_LIMIT_POLICY,
} from '../../redis/redis-rate-limit.guard';

test('N-11: refresh/logout have their own Redis bucket, separate from login', () => {
  assert.notEqual(
    AUTH_SESSION_RATE_LIMIT_POLICY.keyPrefix,
    LOGIN_RATE_LIMIT_POLICY.keyPrefix,
  );
  assert.equal(AUTH_SESSION_RATE_LIMIT_POLICY.policyName, 'auth_session');
  assert.ok(AUTH_SESSION_RATE_LIMIT_POLICY.defaultMax > LOGIN_RATE_LIMIT_POLICY.defaultMax);
  for (const name of ['maxEnvName', 'windowEnvName', 'failClosedEnvName']) {
    assert.notEqual(
      AUTH_SESSION_RATE_LIMIT_POLICY[name as 'maxEnvName'],
      LOGIN_RATE_LIMIT_POLICY[name as 'maxEnvName'],
    );
  }
});
