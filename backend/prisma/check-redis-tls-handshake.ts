import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { createConnection } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  connect as tlsConnect,
  createServer as createTlsServer,
  type ConnectionOptions,
  type TLSSocket,
} from 'node:tls';
import Redis from 'ioredis';
import { buildBaseRedisOptions, readRedisConfig } from '../src/redis/redis.config';
import { loadConfig } from '../../document-worker/src/config';
import { buildRedisOptions } from '../../document-worker/src/redis-connection';
import {
  createTestCertificateAuthority,
  issueTestServerCertificate,
} from './utils/tls-test-chain.util';

/**
 * Proves — with a real CA chain and a real TLS socket — that both Redis
 * consumers (backend + document-worker) verify the Redis peer certificate AND
 * its hostname. No `rejectUnauthorized: false`, no `NODE_TLS_REJECT_UNAUTHORIZED`,
 * no fake "TLS enabled" assertion based only on the shape of an options object.
 *
 * Runs without a Redis binary: a tiny RESP-speaking TLS stub answers the few
 * commands ioredis issues while connecting (AUTH/SELECT/CLIENT/INFO/PING).
 */

const HOSTNAME = 'localhost';
const WRONG_HOSTNAME = 'redis.evil.example.test';

interface CertificateChain {
  caPath: string;
  serverCertPath: string;
  serverKeyPath: string;
}

const createCertificateChain = (directory: string): CertificateChain => {
  const ca = createTestCertificateAuthority(directory, 'Inventory CI Redis Test CA');
  const server = issueTestServerCertificate(ca, directory, 'redis-server', HOSTNAME);
  return {
    caPath: ca.caCertPath,
    serverCertPath: server.certPath,
    serverKeyPath: server.keyPath,
  };
};

const INFO_REPLY = [
  '# Server',
  'redis_version:7.4.0',
  'redis_mode:standalone',
  '# Persistence',
  'loading:0',
  '',
].join('\r\n');

interface ParsedCommand {
  args: string[];
  consumed: number;
}

/** Minimal RESP array parser (ioredis always writes *N bulk arrays). */
const parseCommand = (buffer: string): ParsedCommand | null => {
  const firstLineEnd = buffer.indexOf('\r\n');
  if (firstLineEnd === -1) return null;
  const header = buffer.slice(0, firstLineEnd);
  if (!header.startsWith('*')) {
    // Inline command fallback.
    return { args: header.trim().split(/\s+/u), consumed: firstLineEnd + 2 };
  }
  const count = Number(header.slice(1));
  if (!Number.isInteger(count) || count < 1) return null;

  let offset = firstLineEnd + 2;
  const args: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const lengthLineEnd = buffer.indexOf('\r\n', offset);
    if (lengthLineEnd === -1) return null;
    const lengthLine = buffer.slice(offset, lengthLineEnd);
    if (!lengthLine.startsWith('$')) return null;
    const length = Number(lengthLine.slice(1));
    const dataStart = lengthLineEnd + 2;
    if (buffer.length < dataStart + length + 2) return null;
    args.push(buffer.slice(dataStart, dataStart + length));
    offset = dataStart + length + 2;
  }
  return { args, consumed: offset };
};

const responseFor = (args: string[]): string => {
  const command = (args[0] ?? '').toLowerCase();
  if (command === 'info') return `$${Buffer.byteLength(INFO_REPLY)}\r\n${INFO_REPLY}\r\n`;
  if (command === 'ping') return '+PONG\r\n';
  return '+OK\r\n';
};

interface TlsRedisStub {
  port: number;
  close: () => Promise<void>;
  tlsHandshakes: number;
}

const startTlsRedisStub = async (chain: CertificateChain): Promise<TlsRedisStub> => {
  const state = { tlsHandshakes: 0 };
  const sockets = new Set<TLSSocket>();
  const server = createTlsServer(
    {
      key: readFileSync(chain.serverKeyPath),
      cert: readFileSync(chain.serverCertPath),
      minVersion: 'TLSv1.2',
    },
    (socket) => {
      state.tlsHandshakes += 1;
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
      let pending = '';
      socket.on('data', (chunk: Buffer) => {
        pending += chunk.toString();
        for (;;) {
          const parsed = parseCommand(pending);
          if (!parsed) break;
          pending = pending.slice(parsed.consumed);
          socket.write(responseFor(parsed.args));
        }
      });
      socket.on('error', () => socket.destroy());
    },
  );
  server.on('tlsClientError', () => {
    // Expected for the negative verification cases; the client-side assertion
    // is the authoritative check.
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, () => {
      server.off('error', rejectListen);
      resolveListen();
    });
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object', 'TLS stub must expose a TCP port');

  return {
    port: address.port,
    get tlsHandshakes(): number {
      return state.tlsHandshakes;
    },
    close: async () => {
      for (const socket of sockets) socket.destroy();
      sockets.clear();
      await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    },
  };
};

const attemptTlsHandshake = (options: ConnectionOptions): Promise<TLSSocket> =>
  new Promise((resolveHandshake, rejectHandshake) => {
    const socket = tlsConnect(options, () => {
      resolveHandshake(socket);
    });
    socket.once('error', (error) => {
      socket.destroy();
      rejectHandshake(error);
    });
  });

const expectTlsFailure = async (options: ConnectionOptions, label: string): Promise<void> => {
  let socket: TLSSocket | undefined;
  try {
    socket = await attemptTlsHandshake(options);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? '';
    assert.match(
      code,
      /CERT_ALTNAME_INVALID|UNABLE_TO_VERIFY_LEAF_SIGNATURE|SELF_SIGNED_CERT_IN_CHAIN|DEPTH_ZERO_SELF_SIGNED_CERT/u,
      `${label}: expected a certificate verification failure, got ${code}`,
    );
    return;
  } finally {
    socket?.destroy();
  }
  assert.fail(`${label}: TLS handshake unexpectedly succeeded without a valid chain/hostname`);
};

/** The stub must be TLS-only: otherwise a PONG would not prove a TLS socket. */
const assertPlaintextRejected = (port: number): Promise<void> =>
  new Promise((resolvePlaintext, rejectPlaintext) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    let received = '';
    let settled = false;
    const finish = (failure?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      if (failure) rejectPlaintext(failure);
      else resolvePlaintext();
    };
    const timer = setTimeout(() => finish(), 800);
    socket.on('data', (chunk: Buffer) => {
      received += chunk.toString();
      if (received.includes('+PONG')) {
        finish(new Error('TLS stub answered a plaintext PING'));
      }
    });
    socket.on('error', () => finish());
    socket.on('close', () => finish());
    socket.on('connect', () => socket.write('PING\r\n'));
  });

const withTimeout = <T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> =>
  Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
        timeoutMs,
      );
      timer.unref();
    }),
  ]);

const connectIoredis = async (port: number, tls: ConnectionOptions): Promise<Redis> => {
  const client = new Redis({
    host: HOSTNAME,
    port,
    tls,
    lazyConnect: false,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
    enableReadyCheck: true,
  });
  try {
    await withTimeout(
      new Promise<void>((resolveReady, rejectReady) => {
        client.once('ready', () => resolveReady());
        client.once('error', (error) => rejectReady(error));
      }),
      5000,
      'ioredis TLS ready check',
    );
  } catch (error) {
    client.disconnect();
    throw error;
  }
  return client;
};

const collectSourceFiles = (directory: string): string[] => {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectSourceFiles(full));
    else if (entry.name.endsWith('.ts')) files.push(full);
  }
  return files;
};

const main = async (): Promise<void> => {
  const root = resolve('.');
  const directory = mkdtempSync(join(tmpdir(), 'inventory-redis-tls-'));
  let stub: TlsRedisStub | undefined;

  try {
    const chain = createCertificateChain(directory);
    const ca = readFileSync(chain.caPath);
    const testConfig = {
      host: HOSTNAME,
      port: 1,
      username: undefined,
      password: undefined,
      db: 0,
      keyPrefix: 'inventory-v2:',
      tls: true,
      caCertPath: chain.caPath,
    };

    // 1. Both builders produce the same explicit, verification-on options.
    const backendOptions = buildBaseRedisOptions(testConfig);
    const workerOptions = buildRedisOptions({ ...testConfig });
    assert.ok(backendOptions.tls, 'backend TLS options must be present');
    assert.ok(workerOptions.tls, 'document-worker TLS options must be present');
    assert.deepEqual(workerOptions.tls, backendOptions.tls, 'TLS options must stay in sync');
    for (const [label, tls] of [
      ['backend', backendOptions.tls],
      ['document-worker', workerOptions.tls],
    ] as const) {
      assert.equal(tls.rejectUnauthorized, true, `${label} must verify the peer`);
      assert.equal(tls.minVersion, 'TLSv1.2', `${label} must set a TLS floor`);
      assert.deepEqual(tls.ca, ca, `${label} must use the configured private CA`);
      assert.equal(tls.servername, HOSTNAME, `${label} must pin SNI to the DNS host`);
      assert.equal(tls.checkServerIdentity, undefined, `${label} must not override hostname checks`);
    }

    // 2. REDIS_TLS=false is the only way to get a plaintext connection, and
    //    both config readers parse the TLS/CA env vars identically.
    const envNames = ['REDIS_HOST', 'REDIS_TLS', 'REDIS_CA_CERT_PATH'] as const;
    const previous = new Map(envNames.map((name) => [name, process.env[name]]));
    try {
      process.env.REDIS_HOST = HOSTNAME;
      process.env.REDIS_TLS = 'true';
      process.env.REDIS_CA_CERT_PATH = chain.caPath;
      const backendConfig = readRedisConfig();
      const workerConfig = loadConfig();
      assert.equal(backendConfig.tls, true);
      assert.equal(workerConfig.redis.tls, true);
      assert.equal(backendConfig.caCertPath, chain.caPath);
      assert.equal(workerConfig.redis.caCertPath, chain.caPath);
      assert.equal(backendConfig.host, workerConfig.redis.host);

      process.env.REDIS_TLS = 'false';
      assert.equal(readRedisConfig().tls, false);
      assert.equal(loadConfig().redis.tls, false);
      assert.equal(buildBaseRedisOptions(readRedisConfig()).tls, undefined);
      assert.equal(buildRedisOptions(loadConfig().redis).tls, undefined);
    } finally {
      for (const name of envNames) {
        const value = previous.get(name);
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }

    // 3. Source scan: no global or per-socket verification bypass anywhere.
    const sourceFiles = [
      ...collectSourceFiles(join(root, 'src')),
      ...collectSourceFiles(join(root, '..', 'document-worker', 'src')),
    ];
    assert.ok(sourceFiles.length > 100, 'source scan must cover both Redis consumers');
    const bypasses = [
      /rejectUnauthorized\s*:\s*false/u,
      /checkServerIdentity\s*:\s*\(\)\s*=>/u,
      /NODE_TLS_REJECT_UNAUTHORIZED[^=]*=\s*['"]?0/u,
    ];
    for (const file of sourceFiles) {
      const source = readFileSync(file, 'utf8');
      for (const pattern of bypasses) {
        assert.equal(pattern.test(source), false, `${file} contains a TLS verification bypass`);
      }
    }

    // 4. Deployment config documents the private CA mount in both services.
    const envExample = readFileSync(join(root, '..', '.env.example'), 'utf8');
    assert.match(envExample, /REDIS_CA_CERT_PATH/u);
    assert.match(envExample, /TLS peer and/u);
    assert.match(envExample, /hostname verification remain enabled/u);
    const prodCompose = readFileSync(join(root, '..', 'docker-compose.prod.yml'), 'utf8');
    const caMounts = prodCompose.match(/redis-ca\.crt:\/run\/secrets\/redis-ca\.crt:ro/gu) ?? [];
    assert.ok(
      caMounts.length >= 2,
      'backend + document-worker must document a read-only Redis CA mount',
    );

    // 5. Real TLS handshake against the generated CA/server chain.
    stub = await startTlsRedisStub(chain);
    const baseOptions: ConnectionOptions = {
      host: '127.0.0.1',
      port: stub.port,
      ...backendOptions.tls,
    };

    const verified = await withTimeout(
      attemptTlsHandshake(baseOptions),
      5000,
      'verified TLS handshake',
    );
    assert.equal(verified.authorized, true, 'trusted CA + correct hostname must be authorized');
    assert.equal(verified.getPeerCertificate().subject.CN, HOSTNAME);
    await withTimeout(
      new Promise<void>((resolveRoundTrip, rejectRoundTrip) => {
        verified.once('data', (chunk: Buffer) => {
          if (chunk.toString().includes('+PONG')) resolveRoundTrip();
          else rejectRoundTrip(new Error('unexpected verified-socket response'));
        });
        verified.write('PING\r\n');
      }),
      5000,
      'verified TLS round trip',
    );
    verified.destroy();
    await assertPlaintextRejected(stub.port);

    await expectTlsFailure(
      { ...baseOptions, servername: WRONG_HOSTNAME },
      'wrong hostname',
    );
    await expectTlsFailure(
      {
        host: '127.0.0.1',
        port: stub.port,
        servername: HOSTNAME,
        rejectUnauthorized: true,
        minVersion: 'TLSv1.2',
      },
      'untrusted CA',
    );

    // 6. A real ioredis client (ready check + PING) works over the verified
    //    socket, and fails before `ready` when the hostname does not match.
    const client = await connectIoredis(stub.port, backendOptions.tls as ConnectionOptions);
    try {
      assert.equal(await client.ping(), 'PONG');
    } finally {
      client.disconnect();
    }

    try {
      await connectIoredis(stub.port, {
        ...(backendOptions.tls as ConnectionOptions),
        servername: WRONG_HOSTNAME,
        host: '127.0.0.1',
        port: stub.port,
      });
      assert.fail('ioredis must not reach ready with a mismatched certificate hostname');
    } catch (error) {
      const failure = [
        (error as NodeJS.ErrnoException).code ?? '',
        (error as Error).message ?? '',
      ].join(' ');
      assert.match(
        failure,
        /CERT_ALTNAME_INVALID|does not match certificate|timed out/u,
        'ioredis hostname verification must reject the wrong hostname',
      );
    }

    assert.ok(stub.tlsHandshakes >= 2, 'verified raw + ioredis TLS handshakes must complete');
    console.log(
      `Redis TLS verification check passed (${sourceFiles.length} source files, ` +
        `${stub.tlsHandshakes} completed TLS handshakes, trusted CA + hostname verified, ` +
        'wrong hostname/untrusted CA/plaintext rejected).',
    );
  } finally {
    if (stub) await stub.close();
    rmSync(directory, { recursive: true, force: true });
  }
};

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
