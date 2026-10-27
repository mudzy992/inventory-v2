import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ADVISORY_LOCK_NAMESPACE,
  ADVISORY_LOCKS,
  advisoryLockSql,
} from './advisory-locks.util';

test('N-14: advisory lock keys are named, distinct and non-zero', () => {
  const keys = Object.values(ADVISORY_LOCKS);
  assert.equal(new Set(keys).size, keys.length);
  for (const key of keys) {
    assert.ok(Number.isSafeInteger(key) && key > 0);
  }
  assert.ok(Number.isSafeInteger(ADVISORY_LOCK_NAMESPACE));
});

test('SQL is parameterised: namespace + key are values, never magic literals', () => {
  const sql = advisoryLockSql(ADVISORY_LOCKS.categoryTree);
  assert.match(sql.sql, /pg_advisory_xact_lock/u);
  assert.ok(sql.values.includes(ADVISORY_LOCK_NAMESPACE));
  assert.ok(sql.values.includes(ADVISORY_LOCKS.categoryTree));
  assert.equal(sql.values.includes(ADVISORY_LOCKS.setupBootstrap), false);
});

test('two different locks produce two different parameter sets', () => {
  assert.notDeepEqual(
    advisoryLockSql(ADVISORY_LOCKS.categoryTree).values,
    advisoryLockSql(ADVISORY_LOCKS.setupBootstrap).values,
  );
});
