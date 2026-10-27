import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { createServer, type Server, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  createSecureContext,
  type SecureContext,
  type TLSSocket,
  TLSSocket as TlsSocket,
} from 'node:tls';
import { Client } from 'pg';
import { resolveDatabaseConfig, type DatabaseConnectionConfig } from '../src/prisma/database-config.util';
import {
  createTestCertificateAuthority,
  issueTestServerCertificate,
} from './utils/tls-test-chain.util';

/**
 * Proves — with a real CA chain, a real TLS handshake and node-postgres' own
 * SSLRequest negotiation — that the PostgreSQL connection config verifies the
 * peer certificate AND its hostname. A TLS-only, in-process PostgreSQL wire
 * stub answers StartupMessage and a simple `SELECT 1`, so the check needs no
 * external database and cannot pass with a plaintext or unverified socket.
 */

const HOSTNAME = 'localhost';
const WRONG_HOSTNAME = 'db.other.example.test';
const PG_PROTOCOL_VERSION = 196_608;

const int16 = (value: number): Buffer => {
  const buffer = Buffer.alloc(2);
  buffer.writeInt16BE(value);
  return buffer;
};

const int32 = (value: number): Buffer => {
  const buffer = Buffer.alloc(4);
  buffer.writeInt32BE(value);
  return buffer;
};

const cstring = (value: string): Buffer => Buffer.concat([Buffer.from(value, 'utf8'), Buffer.from([0])]);

const backendMessage = (type: string, body: Buffer): Buffer =>
  Buffer.concat([Buffer.from(type, 'utf8'), int32(body.length + 4), body]);

const parameterStatus = (name: string, value: string): Buffer =>
  backendMessage('S', Buffer.concat([cstring(name), cstring(value)]));

const STARTUP_REPLY = Buffer.concat([
  backendMessage('R', int32(0)), // AuthenticationOk
  parameterStatus('server_version', '16.0'),
  parameterStatus('client_encoding', 'UTF8'),
  parameterStatus('integer_datetimes', 'on'),
  backendMessage('K', Buffer.concat([int32(1234), int32(5678)])), // BackendKeyData
  backendMessage('Z', Buffer.from([0x49])), // ReadyForQuery ('I')
]);

const QUERY_REPLY = Buffer.concat([
  backendMessage(
    'T',
    Buffer.concat([
      int16(1),
      cstring('?column?'),
      int32(0), // table OID
      int16(0), // column attribute
      int32(23), // int4 type OID
      int16(4), // type size
      int32(-1), // type modifier
      int16(0), // text format
    ]),
  ),
  backendMessage('D', Buffer.concat([int16(1), int32(1), Buffer.from('1')])),
  backendMessage('C', cstring('SELECT 1')),
  backendMessage('Z', Buffer.from([0x49])),
]);

const isSslRequest = (chunk: Buffer): boolean =>
  chunk.length >= 8 && chunk.readInt32BE(0) === 8 && chunk.readInt32BE(4) === 80_877_103;

interface PostgresTlsStub {
  port: number;
  tlsHandshakes: number;
  sslRequests: number;
  plaintextAttempts: number;
  close: () => Promise<void>;
}

const startPostgresTlsStub = async (secureContext: SecureContext): Promise<PostgresTlsStub> => {
  const state = { tlsHandshakes: 0, sslRequests: 0, plaintextAttempts: 0 };
  const sockets = new Set<Socket>();
  const tlsSockets = new Set<TLSSocket>();

  const handleDecryptedData = (socket: TLSSocket): ((chunk: Buffer) => void) => {
    let pending = Buffer.alloc(0);
    return (chunk: Buffer): void => {
      pending = Buffer.concat([pending, chunk]);
      for (;;) {
        if (pending.length < 8) return;
        const startupLength = pending.readInt32BE(0);
        if (pending.readInt32BE(4) === PG_PROTOCOL_VERSION) {
          if (pending.length < startupLength) return;
          pending = pending.subarray(startupLength);
          socket.write(STARTUP_REPLY);
          continue;
        }
        if (pending.length < 5) return;
        const type = String.fromCharCode(pending[0]);
        const messageLength = pending.readInt32BE(1);
        if (pending.length < messageLength + 1) return;
        pending = pending.subarray(messageLength + 1);
        if (type === 'Q') socket.write(QUERY_REPLY);
        else if (type === 'X') socket.end();
      }
    };
  };

  const server: Server = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => socket.destroy());
    socket.once('data', (chunk: Buffer) => {
      socket.pause();
      if (!isSslRequest(chunk)) {
        // A TLS-only PostgreSQL endpoint must never answer a plaintext
        // StartupMessage; closing here makes node-postgres fail its connect.
        state.plaintextAttempts += 1;
        socket.destroy();
        return;
      }
      socket.write('S');
      state.sslRequests += 1;
      const tlsSocket = new TlsSocket(socket, { isServer: true, secureContext });
      tlsSockets.add(tlsSocket);
      tlsSocket.on('close', () => tlsSockets.delete(tlsSocket));
      tlsSocket.on('error', () => tlsSocket.destroy());
      tlsSocket.once('secure', () => {
        state.tlsHandshakes += 1;
        tlsSocket.on('data', handleDecryptedData(tlsSocket));
      });
      if (chunk.length > 8) socket.unshift(chunk.subarray(8));
      socket.resume();
    });
  });
  server.on('tlsClientError', () => {
    // Expected for negative verification cases; client-side errors are the
    // authoritative assertions below.
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, () => {
      server.off('error', rejectListen);
      resolveListen();
    });
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object', 'PostgreSQL TLS stub must expose a TCP port');

  return {
    port: address.port,
    get tlsHandshakes(): number {
      return state.tlsHandshakes;
    },
    get sslRequests(): number {
      return state.sslRequests;
    },
    get plaintextAttempts(): number {
      return state.plaintextAttempts;
    },
    close: async () => {
      for (const tlsSocket of tlsSockets) tlsSocket.destroy();
      tlsSockets.clear();
      for (const socket of sockets) socket.destroy();
      sockets.clear();
      await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    },
  };
};

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

const buildClient = (config: DatabaseConnectionConfig): Client => {
  const client = new Client({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    ssl: config.ssl,
    connectionTimeoutMillis: 5000,
  });
  // TLS failures can surface as an 'error' event after connect() rejects.
  client.on('error', () => {});
  return client;
};

const queryOne = async (config: DatabaseConnectionConfig): Promise<string> => {
  const client = buildClient(config);
  await withTimeout(client.connect(), 6000, 'PostgreSQL TLS connect');
  try {
    const result = await withTimeout(client.query('SELECT 1'), 6000, 'PostgreSQL TLS query');
    assert.equal(result.rows.length, 1);
    return String(result.rows[0]['?column?']);
  } finally {
    await client.end().catch(() => {});
  }
};

const expectConnectFailure = async (
  config: DatabaseConnectionConfig,
  label: string,
  expected: RegExp,
): Promise<void> => {
  const client = buildClient(config);
  try {
    await withTimeout(client.connect(), 6000, `${label} connect`);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? '';
    const description = `${code} ${(error as Error).message ?? ''}`;
    assert.match(description, expected, `${label}: unexpected failure ${description}`);
    return;
  } finally {
    await client.end().catch(() => {});
  }
  assert.fail(`${label}: PostgreSQL connection unexpectedly succeeded`);
};

const main = async (): Promise<void> => {
  const root = resolve('.');
  const directory = mkdtempSync(join(tmpdir(), 'inventory-postgres-tls-'));
  const stubs: PostgresTlsStub[] = [];

  try {
    const ca = createTestCertificateAuthority(directory, 'Inventory CI PostgreSQL Test CA');
    const caPem = readFileSync(ca.caCertPath, 'utf8');
    const goodServer = issueTestServerCertificate(ca, directory, 'postgres-good', HOSTNAME);
    const wrongHostServer = issueTestServerCertificate(
      ca,
      directory,
      'postgres-wrong-host',
      WRONG_HOSTNAME,
    );
    const otherDirectory = join(directory, 'untrusted-ca');
    mkdirSync(otherDirectory);
    const otherCa = createTestCertificateAuthority(otherDirectory, 'Untrusted CI CA');

    const makeContext = (cert: typeof goodServer): SecureContext =>
      createSecureContext({
        key: readFileSync(cert.keyPath),
        cert: readFileSync(cert.certPath),
        minVersion: 'TLSv1.2',
      });

    const goodStub = await startPostgresTlsStub(makeContext(goodServer));
    const wrongHostStub = await startPostgresTlsStub(makeContext(wrongHostServer));
    stubs.push(goodStub, wrongHostStub);

    const baseEnv = {
      DATABASE_USER: 'inventory_user',
      DATABASE_PASSWORD: 'test-password',
      DATABASE_NAME: 'inventory_ci',
      DATABASE_SSL_CA: ca.caCertPath,
    };

    const verifyFullConfig = resolveDatabaseConfig({
      ...baseEnv,
      DATABASE_URL: `postgresql://inventory_user:test-password@${HOSTNAME}:${goodStub.port}/inventory_ci?sslmode=verify-full`,
      DATABASE_SSL_MODE: 'verify-full',
    });

    // 1. Configuration is explicit, verified TLS — never a silent default.
    assert.deepEqual(verifyFullConfig.ssl, {
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2',
      ca: caPem,
      servername: HOSTNAME,
    });
    assert.equal(verifyFullConfig.ssl?.checkServerIdentity, undefined);

    for (const mode of ['require', 'verify-ca', 'verify-full'] as const) {
      const config = resolveDatabaseConfig({
        ...baseEnv,
        DATABASE_URL: `postgresql://inventory_user:test-password@${HOSTNAME}:${goodStub.port}/inventory_ci?sslmode=${mode}`,
        DATABASE_SSL_MODE: mode,
      });
      assert.equal(config.ssl?.rejectUnauthorized, true, mode);
      assert.equal(config.ssl?.minVersion, 'TLSv1.2', mode);
      assert.equal(await queryOne(config), '1', `${mode} must query over verified TLS`);
    }

    const disabled = resolveDatabaseConfig({
      ...baseEnv,
      DATABASE_SSL_CA: undefined,
      DATABASE_SSL_MODE: 'disable',
      DATABASE_URL: `postgresql://inventory_user:test-password@${HOSTNAME}:${goodStub.port}/inventory_ci?sslmode=disable`,
    });
    assert.equal(disabled.ssl, undefined, 'sslmode=disable is the only plaintext path');

    // 2. Downgrade vectors are rejected by the configuration reader.
    assert.throws(
      () =>
        resolveDatabaseConfig({
          ...baseEnv,
          DATABASE_URL: `postgresql://inventory_user:test-password@${HOSTNAME}:${goodStub.port}/inventory_ci?sslmode=disable`,
          DATABASE_SSL_MODE: 'verify-full',
        }),
      /Conflicting PostgreSQL sslmode/,
    );
    assert.throws(
      () =>
        resolveDatabaseConfig({
          ...baseEnv,
          DATABASE_URL: `postgresql://inventory_user:test-password@${HOSTNAME}:${goodStub.port}/inventory_ci?sslmode=prefer`,
        }),
      /Unsupported PostgreSQL sslmode/,
    );
    assert.throws(
      () =>
        resolveDatabaseConfig({
          ...baseEnv,
          DATABASE_SSL_MODE: 'disable',
          DATABASE_URL: `postgresql://inventory_user:test-password@${HOSTNAME}:${goodStub.port}/inventory_ci`,
        }),
      /requires PostgreSQL TLS to be enabled/,
    );
    assert.throws(
      () =>
        resolveDatabaseConfig({
          ...baseEnv,
          DATABASE_SSL_CA: join(directory, 'missing-ca.crt'),
          DATABASE_SSL_MODE: 'verify-full',
          DATABASE_URL: `postgresql://inventory_user:test-password@${HOSTNAME}:${goodStub.port}/inventory_ci`,
        }),
      /ENOENT/,
      'an unreadable CA must fail closed at startup',
    );

    // 3. Real TLS failures: wrong CA, wrong hostname, plaintext.
    await expectConnectFailure(
      {
        ...verifyFullConfig,
        ssl: {
          ...verifyFullConfig.ssl,
          rejectUnauthorized: true,
          minVersion: 'TLSv1.2',
          ca: readFileSync(otherCa.caCertPath, 'utf8'),
        },
      },
      'untrusted CA',
      /SELF_SIGNED_CERT_IN_CHAIN|UNABLE_TO_VERIFY_LEAF_SIGNATURE|DEPTH_ZERO_SELF_SIGNED_CERT|unable to verify/u,
    );

    await expectConnectFailure(
      {
        ...verifyFullConfig,
        port: wrongHostStub.port,
      },
      'certificate hostname mismatch',
      /CERT_ALTNAME_INVALID|does not match certificate|Hostname\/IP/u,
    );

    await expectConnectFailure(
      disabled,
      'plaintext against TLS-only PostgreSQL',
      /ECONNRESET|Connection terminated|socket hang up/u,
    );

    // 4. Wiring + deployment configuration must not reintroduce a bypass.
    const prismaFactory = readFileSync(join(root, 'src', 'prisma', 'create-prisma-client.ts'), 'utf8');
    assert.match(prismaFactory, /resolveDatabaseConfig\(\)/u);
    assert.match(prismaFactory, /ssl:\s*config\.ssl/u);
    assert.equal(/rejectUnauthorized\s*:\s*false/u.test(prismaFactory), false);

    const envExample = readFileSync(join(root, '..', '.env.example'), 'utf8');
    assert.match(envExample, /DATABASE_SSL_MODE/u);
    assert.match(envExample, /DATABASE_SSL_CA/u);
    assert.match(envExample, /verify the peer certificate and hostname/u);
    for (const composeFile of ['docker-compose.yml', 'docker-compose.prod.yml']) {
      const compose = readFileSync(join(root, '..', composeFile), 'utf8');
      assert.match(compose, /DATABASE_SSL_MODE/u, composeFile);
      assert.match(compose, /DATABASE_SSL_CA/u, composeFile);
    }

    // Three `sslmode` variants complete a handshake; the untrusted-CA client
    // aborts during verification, so it may never emit the server 'secure'.
    assert.ok(
      goodStub.tlsHandshakes >= 3,
      `expected verified TLS handshakes, got ${goodStub.tlsHandshakes}`,
    );
    assert.ok(goodStub.plaintextAttempts >= 1, 'plaintext connection must be rejected');
    assert.ok(wrongHostStub.sslRequests >= 1, 'wrong-hostname TLS negotiation must be attempted');
    console.log(
      `PostgreSQL TLS verification check passed (${goodStub.tlsHandshakes} verified TLS handshakes, ` +
        `${goodStub.sslRequests + wrongHostStub.sslRequests} SSL negotiations, ` +
        'verified CA + hostname SELECT 1, wrong CA/hostname/plaintext rejected).',
    );
  } finally {
    for (const stub of stubs) await stub.close();
    rmSync(directory, { recursive: true, force: true });
  }
};

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
