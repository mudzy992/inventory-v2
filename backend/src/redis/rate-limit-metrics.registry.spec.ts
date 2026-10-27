import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  classifyRateLimitFailure,
  normalizeRateLimitPolicy,
  RATE_LIMIT_METRICS_MAX_POLICIES,
  RATE_LIMIT_POLICY_OVERFLOW,
  rateLimitMetricsRegistry,
  recordRateLimitDecision,
  sanitizeRateLimitError,
  type RateLimitOutcome,
} from './rate-limit-metrics.registry';

const at = new Date('2026-10-27T11:00:00.000Z');

const record = (
  outcome: RateLimitOutcome,
  options: { policy?: string; error?: unknown; at?: Date } = {},
): void => {
  recordRateLimitDecision({
    policy: options.policy ?? 'login',
    outcome,
    error: options.error,
    at: options.at ?? at,
  });
};

describe('rate-limit label helpers', () => {
  it('normalises policy labels to a bounded safe alphabet', () => {
    assert.equal(normalizeRateLimitPolicy('LOGIN'), 'login');
    assert.equal(normalizeRateLimitPolicy('public-equipment.v2'), 'public-equipment.v2');
    assert.equal(normalizeRateLimitPolicy('ratelimit:login:203.0.113.1'), 'ratelimit_login_203.0.113.1');
    assert.equal(normalizeRateLimitPolicy(''), RATE_LIMIT_POLICY_OVERFLOW);
    assert.equal(normalizeRateLimitPolicy('x'.repeat(80)).length, 32);
  });

  it('classifies failures without keeping the raw error', () => {
    assert.equal(classifyRateLimitFailure(new Error('Command timed out after 1000ms')), 'timeout');
    assert.equal(classifyRateLimitFailure(new Error('Redis returned an invalid rate-limit counter value')), 'invalid_counter');
    assert.equal(classifyRateLimitFailure(new Error('connect ECONNREFUSED 127.0.0.1:6379')), 'connection');
    assert.equal(classifyRateLimitFailure(new Error('READONLY You can\'t write against a read only replica')), 'unknown');
    assert.equal(classifyRateLimitFailure('ETIMEDOUT'), 'timeout');
    assert.equal(classifyRateLimitFailure(undefined), 'unknown');
  });

  it('removes credentials, IPs, key names and long payloads from error details', () => {
    const safe = sanitizeRateLimitError(
      new Error('password=ci-secret ECONNREFUSED ratelimit:login:203.0.113.77 on 10.0.0.4'),
    );
    assert.ok(!safe.includes('ci-secret'));
    assert.ok(!safe.includes('ratelimit:login'));
    assert.ok(!safe.includes('203.0.113.77'));
    assert.ok(!safe.includes('10.0.0.4'));
    assert.ok(safe.includes('[redacted]'));
    assert.ok(safe.includes('[redacted-key]'));
    assert.ok(safe.includes('[redacted-ip]'));
    assert.ok(sanitizeRateLimitError(new Error('x'.repeat(500))).length <= 200);
    assert.equal(sanitizeRateLimitError(''), 'unknown');
    assert.equal(sanitizeRateLimitError(new Error('   \n  ')), 'unknown');
    assert.ok(!sanitizeRateLimitError(new Error('Bearer eyJhbGciOiJIUzI1NiJ9.x.y')).includes('eyJhbGciOiJIUzI1NiJ9'));
  });
});

describe('rateLimitMetricsRegistry', () => {
  it('counts decisions by outcome, policy and failure category', () => {
    rateLimitMetricsRegistry.reset(at);
    record('allowed');
    record('allowed', { policy: 'public_equipment' });
    record('exceeded', { policy: 'public_equipment' });
    record('fail_open', { error: new Error('connect ECONNREFUSED') });
    record('fail_closed', { error: new Error('Command timed out') });

    const snapshot = rateLimitMetricsRegistry.snapshot(at);
    assert.equal(snapshot.intervalDecisions, 5);
    assert.equal(snapshot.totalDecisions, 5);
    assert.deepEqual(snapshot.byOutcome, {
      allowed: 2,
      exceeded: 1,
      fail_open: 1,
      fail_closed: 1,
    });
    assert.deepEqual(snapshot.byPolicy, { login: 3, public_equipment: 2 });
    assert.deepEqual(snapshot.byFailureReason, {
      timeout: 1,
      connection: 1,
      invalid_counter: 0,
      unknown: 0,
    });
    assert.equal(snapshot.intervalFailures, 2);
    assert.equal(snapshot.totalFailures, 2);
    assert.equal(snapshot.intervalExceeded, 1);
    assert.equal(snapshot.lastFailureReason, 'timeout');
    assert.equal(snapshot.lastFailurePolicy, 'login');
    assert.equal(snapshot.lastFailureAt, at.toISOString());
  });

  it('tracks and clears the consecutive-failure streak on a successful check', () => {
    rateLimitMetricsRegistry.reset(at);
    record('fail_open', { error: new Error('ECONNREFUSED') });
    record('fail_closed', { error: new Error('ECONNREFUSED') });
    record('fail_open', { error: new Error('ECONNREFUSED') });
    assert.equal(rateLimitMetricsRegistry.snapshot(at).consecutiveFailures, 3);
    assert.equal(rateLimitMetricsRegistry.snapshot(at).maxConsecutiveFailures, 3);

    record('allowed');
    const afterSuccess = rateLimitMetricsRegistry.snapshot(at);
    assert.equal(afterSuccess.consecutiveFailures, 0);
    assert.equal(afterSuccess.maxConsecutiveFailures, 3);

    record('fail_open', { error: new Error('ECONNREFUSED') });
    assert.equal(rateLimitMetricsRegistry.snapshot(at).consecutiveFailures, 1);
    assert.equal(rateLimitMetricsRegistry.snapshot(at).maxConsecutiveFailures, 3);
  });

  it('drains only the interval while keeping lifetime totals and the streak', () => {
    rateLimitMetricsRegistry.reset(at);
    record('fail_open', { error: new Error('ECONNREFUSED') });
    const later = new Date(at.getTime() + 45_000);
    const first = rateLimitMetricsRegistry.consumeSnapshot(later);
    assert.equal(first.intervalDecisions, 1);
    assert.equal(first.secondsSinceLastFailure, 45);
    assert.equal(first.consecutiveFailures, 1);

    const second = rateLimitMetricsRegistry.snapshot(later);
    assert.equal(second.intervalDecisions, 0);
    assert.equal(second.totalDecisions, 1);
    assert.equal(second.totalFailures, 1);
    assert.equal(second.consecutiveFailures, 1);
    assert.equal(second.intervalStartedAt, later.toISOString());
    assert.equal(second.lastFailureAt, at.toISOString());
  });

  it('caps distinct policy labels and folds the rest into a bounded overflow key', () => {
    rateLimitMetricsRegistry.reset(at);
    for (let index = 0; index < RATE_LIMIT_METRICS_MAX_POLICIES + 3; index += 1) {
      record('allowed', { policy: `policy_${index}` });
    }
    const snapshot = rateLimitMetricsRegistry.snapshot(at);
    assert.equal(snapshot.intervalDecisions, RATE_LIMIT_METRICS_MAX_POLICIES + 3);
    assert.equal(snapshot.overflowPolicies, 3);
    assert.equal(snapshot.byPolicy[RATE_LIMIT_POLICY_OVERFLOW], 3);
    assert.equal(Object.keys(snapshot.byPolicy).length, RATE_LIMIT_METRICS_MAX_POLICIES + 1);
  });

  it('never keeps client IPs, Redis keys or raw error text in a snapshot', () => {
    rateLimitMetricsRegistry.reset(at);
    record('fail_open', {
      policy: 'login',
      error: new Error('password=ci-secret ratelimit:login:203.0.113.99'),
    });
    const json = JSON.stringify(rateLimitMetricsRegistry.snapshot(at));
    assert.ok(!json.includes('ci-secret'));
    assert.ok(!json.includes('ratelimit:login'));
    assert.ok(!json.includes('203.0.113.99'));
    assert.ok(json.includes('"lastFailurePolicy":"login"'));
  });

  it('handles empty state and malformed timestamps', () => {
    rateLimitMetricsRegistry.reset(at);
    const empty = rateLimitMetricsRegistry.snapshot(at);
    assert.equal(empty.intervalDecisions, 0);
    assert.equal(empty.secondsSinceLastFailure, null);
    assert.equal(empty.lastFailureAt, null);
    assert.equal(empty.lastFailureReason, null);
    assert.equal(empty.consecutiveFailures, 0);

    record('allowed', { at: new Date('invalid') });
    assert.equal(rateLimitMetricsRegistry.snapshot(at).intervalDecisions, 1);
    assert.equal(rateLimitMetricsRegistry.snapshot(at).secondsSinceLastFailure, null);
  });

  it('reset clears all counters, streak and last-failure metadata', () => {
    rateLimitMetricsRegistry.reset(at);
    record('fail_open', { error: new Error('ECONNREFUSED') });
    rateLimitMetricsRegistry.reset(new Date(at.getTime() + 60_000));
    const snapshot = rateLimitMetricsRegistry.snapshot(at);
    assert.equal(snapshot.totalDecisions, 0);
    assert.equal(snapshot.totalFailures, 0);
    assert.equal(snapshot.consecutiveFailures, 0);
    assert.equal(snapshot.maxConsecutiveFailures, 0);
    assert.equal(snapshot.lastFailureAt, null);
    assert.deepEqual(snapshot.byPolicy, {});
  });
});
