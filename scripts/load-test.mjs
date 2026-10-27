#!/usr/bin/env node
/**
 * Dependency-free staging load-test harness / p95 SLO gate.
 *
 * The owner still runs the real staging p95 test against a production-sized
 * dataset, but the harness, the SLO thresholds and the math are now in the
 * repository and exercised by CI against a local HTTP server. No k6 / autocannon
 * / artillery install is needed on the server.
 *
 *   node scripts/load-test.mjs --base-url https://staging.example \
 *       --endpoint /health --duration 30 --concurrency 20 \
 *       --p95-ms 500 --error-rate 0.01 --json report.json
 *
 * Exit code 1 means "SLO breached" (or no samples), so it can be used directly
 * as a release gate. See docs/load-testing.md.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const DEFAULTS = Object.freeze({
  endpoint: '/health',
  durationMs: 30_000,
  concurrency: 20,
  timeoutMs: 5_000,
  p95Ms: 500,
  errorRate: 0.01,
});

/** Nearest-rank percentile; returns 0 for an empty sample. */
export const percentile = (values, fraction) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil(fraction * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
};

export const buildReport = (latencies, failures, context) => {
  const count = latencies.length + failures;
  return {
    ...context,
    count,
    ok: count - failures,
    failures,
    errorRate: count === 0 ? 1 : failures / count,
    p50: percentile(latencies, 0.5),
    p95: percentile(latencies, 0.95),
    p99: percentile(latencies, 0.99),
    max: latencies.length === 0 ? 0 : Math.max(...latencies),
  };
};

/** Pure SLO decision, unit tested in scripts/load-test.spec.mjs. */
export const evaluateSlo = (report, thresholds = {}) => {
  const p95Ms = thresholds.p95Ms ?? DEFAULTS.p95Ms;
  const maxErrorRate = thresholds.errorRate ?? DEFAULTS.errorRate;
  const minSamples = thresholds.minSamples ?? 1;
  const violations = [];
  if (report.count < minSamples) violations.push(`only ${report.count} samples (need >= ${minSamples})`);
  if (report.p95 > p95Ms) violations.push(`p95 ${report.p95.toFixed(1)}ms > ${p95Ms}ms`);
  if (report.errorRate > maxErrorRate) {
    violations.push(`error rate ${(report.errorRate * 100).toFixed(2)}% > ${(maxErrorRate * 100).toFixed(2)}%`);
  }
  return { pass: violations.length === 0, violations, thresholds: { p95Ms, maxErrorRate, minSamples } };
};

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/**
 * Fixed-concurrency, fixed-duration load. Every attempt measures its own
 * latency; transport failures and non-2xx responses count as failures.
 */
export const runLoadTest = async (options = {}) => {
  const baseUrl = (options.baseUrl ?? '').replace(/\/+$/u, '');
  const endpoint = options.endpoint ?? DEFAULTS.endpoint;
  const durationMs = options.durationMs ?? DEFAULTS.durationMs;
  const concurrency = options.concurrency ?? DEFAULTS.concurrency;
  const timeoutMs = options.timeoutMs ?? DEFAULTS.timeoutMs;
  if (!/^https?:\/\//u.test(baseUrl)) throw new Error('baseUrl must start with http:// or https://');
  if (!endpoint.startsWith('/')) throw new Error('endpoint must start with /');
  for (const [name, value] of Object.entries({ durationMs, concurrency, timeoutMs })) {
    if (!Number.isFinite(value) || value < 1) throw new Error(`${name} must be a positive number`);
  }
  const url = `${baseUrl}${endpoint}`;
  const deadline = Date.now() + durationMs;
  const latencies = [];
  let failures = 0;
  const workers = Array.from({ length: Math.max(1, Math.floor(concurrency)) }, async () => {
    while (Date.now() < deadline) {
      const started = performance.now();
      try {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(timeoutMs),
          headers: { 'x-load-test': 'inventory-v2-slo' },
        });
        // Consume the body so connections are actually released/reused.
        await response.arrayBuffer();
        const elapsed = performance.now() - started;
        // `latencies` holds successful samples only; failures are counted
        // separately so errorRate = failures / (ok + failures).
        if (response.ok) latencies.push(elapsed);
        else failures += 1;
      } catch {
        failures += 1;
      }
      // Bounded pacing prevents a hot loop from starving the event loop.
      await sleep(1);
    }
  });
  await Promise.all(workers);
  return buildReport(latencies, failures, { url, durationMs, concurrency, timeoutMs });
};

const parseArgs = (argv) => {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (key === 'json' || key === 'help') { out[key] = true; continue; }
    if (next === undefined || next.startsWith('--')) throw new Error(`--${key} needs a value`);
    out[key] = next;
    i += 1;
  }
  return out;
};

const cli = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node scripts/load-test.mjs --base-url URL [--endpoint /health] [--duration SEC] [--concurrency N] [--p95-ms MS] [--error-rate 0.01] [--json FILE]');
    return;
  }
  const report = await runLoadTest({
    baseUrl: args['base-url'],
    endpoint: args.endpoint,
    durationMs: args.duration === undefined ? undefined : Number(args.duration) * 1000,
    concurrency: args.concurrency === undefined ? undefined : Number(args.concurrency),
    timeoutMs: args['timeout-ms'] === undefined ? undefined : Number(args['timeout-ms']),
  });
  const slo = evaluateSlo(report, {
    p95Ms: args['p95-ms'] === undefined ? undefined : Number(args['p95-ms']),
    errorRate: args['error-rate'] === undefined ? undefined : Number(args['error-rate']),
  });
  const output = { report, slo, generatedAt: new Date().toISOString() };
  if (args.json) writeFileSync(String(args.json), `${JSON.stringify(output, null, 2)}\n`);
  console.log(`Load test: ${report.count} requests, p50=${report.p50.toFixed(1)}ms p95=${report.p95.toFixed(1)}ms p99=${report.p99.toFixed(1)}ms max=${report.max.toFixed(1)}ms errors=${report.failures} (${(report.errorRate * 100).toFixed(2)}%)`);
  console.log(`SLO: ${slo.pass ? 'PASS' : `FAIL (${slo.violations.join('; ')})`}`);
  if (!slo.pass) process.exitCode = 1;
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  cli().catch((error) => {
    console.error(`Load test failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
