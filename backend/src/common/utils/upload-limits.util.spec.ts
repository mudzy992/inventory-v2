import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveMaxUploadBytes } from './upload-limits.util';

const MB = 1024 * 1024;

test('uses the configured upload size as an early parser limit', () => {
  assert.equal(resolveMaxUploadBytes(8, 10), 8 * MB);
});

test('falls back to the environment value for invalid settings', () => {
  assert.equal(resolveMaxUploadBytes(Number.POSITIVE_INFINITY, 12), 12 * MB);
  assert.equal(resolveMaxUploadBytes(Number.NaN, 12), 12 * MB);
  assert.equal(resolveMaxUploadBytes(-1, 12), 12 * MB);
});

test('uses a safe default if both setting and environment value are invalid', () => {
  assert.equal(resolveMaxUploadBytes(Number.POSITIVE_INFINITY, Number.NaN), 10 * MB);
});
