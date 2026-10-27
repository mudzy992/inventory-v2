import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { buildReport, evaluateSlo, percentile, runLoadTest } from './load-test.mjs';

const startServer = async (handler) => {
  const server = createServer(handler);
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const { port } = server.address();
  return { server, baseUrl: `http://127.0.0.1:${port}` };
};

const stopServer = (server) => new Promise((done) => server.close(done));

test('percentile uses nearest-rank semantics and handles empty samples', () => {
  const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  assert.equal(percentile(values, 0.5), 50);
  assert.equal(percentile(values, 0.95), 100);
  assert.equal(percentile(values, 0), 10);
  assert.equal(percentile([], 0.95), 0);
  assert.deepEqual(values, [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
});

test('buildReport computes p50/p95/p99/max and the failure ratio', () => {
  const report = buildReport([10, 20, 30, 40], 1, { url: 'http://x/health' });
  assert.equal(report.count, 5);
  assert.equal(report.ok, 4);
  assert.equal(report.failures, 1);
  assert.equal(report.errorRate, 0.2);
  assert.equal(report.p50, 20);
  assert.equal(report.p95, 40);
  assert.equal(report.max, 40);
  assert.equal(buildReport([], 0, {}).errorRate, 1);
});

test('SLO gate passes inside budget and fails on p95, errors and no samples', () => {
  const report = buildReport([100, 120, 140, 400], 0, {});
  assert.equal(evaluateSlo(report, { p95Ms: 500, errorRate: 0.01 }).pass, true);
  const slow = evaluateSlo(report, { p95Ms: 100, errorRate: 0.01 });
  assert.equal(slow.pass, false);
  assert.ok(slow.violations.some((line) => line.includes('p95')));
  const errors = evaluateSlo(buildReport([10], 1, {}), { p95Ms: 500, errorRate: 0.01 });
  assert.equal(errors.pass, false);
  assert.ok(errors.violations.some((line) => line.includes('error rate')));
  const empty = evaluateSlo(buildReport([], 0, {}), { p95Ms: 500, errorRate: 0.01 });
  assert.equal(empty.pass, false);
  assert.ok(empty.violations.some((line) => line.includes('samples')));
});

test('runLoadTest drives a real HTTP endpoint and passes the SLO', async () => {
  let hits = 0;
  const { server, baseUrl } = await startServer((_req, res) => {
    hits += 1;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"status":"ok"}');
  });
  try {
    const report = await runLoadTest({
      baseUrl,
      endpoint: '/health',
      durationMs: 120,
      concurrency: 4,
      timeoutMs: 1000,
    },);
    assert.ok(report.count >= 4, `expected samples, got ${report.count}`);
    assert.ok(hits >= 4);
    assert.equal(report.failures, 0);
    assert.ok(Number.isFinite(report.p95) && report.p95 > 0);
    assert.equal(report.url, `${baseUrl}/health`);
    assert.equal(evaluateSlo(report, { p95Ms: 5_000, errorRate: 0 }).pass, true);
  } finally {
    await stopServer(server);
  }
});

test('runLoadTest counts 5xx responses as SLO failures', async () => {
  const { server, baseUrl } = await startServer((_req, res) => {
    res.writeHead(503);
    res.end('unavailable');
  });
  try {
    const report = await runLoadTest({ baseUrl, durationMs: 60, concurrency: 2, timeoutMs: 1000 });
    assert.ok(report.count >= 2);
    assert.equal(report.errorRate, 1);
    assert.equal(evaluateSlo(report, { p95Ms: 5_000, errorRate: 0.01 }).pass, false);
  } finally {
    await stopServer(server);
  }
});

test('runLoadTest rejects unsafe configuration before doing any IO', async () => {
  await assert.rejects(() => runLoadTest({ baseUrl: 'file:///etc/passwd' }), /baseUrl/u);
  await assert.rejects(
    () => runLoadTest({ baseUrl: 'http://127.0.0.1', endpoint: 'health' }),
    /endpoint/u,
  );
  await assert.rejects(
    () => runLoadTest({ baseUrl: 'http://127.0.0.1', concurrency: 0 }),
    /concurrency/u,
  );
});
