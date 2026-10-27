import { Logger } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import type { Server, ServerOptions } from 'socket.io';
import { logStructuredEvent, safeErrorText } from '../common/logging/structured-event.logger';
import type { CorsOriginPolicy } from '../common/utils/cors-origins.util';
import { buildBaseRedisOptions, readRedisConfig } from './redis.config';
import { buildSocketIoChannelContract } from './socketio-channel-contract.util';
import {
  resolveSocketIoAdapterPolicy,
  setActiveSocketIoAdapterMode,
  type SocketIoAdapterMode,
} from './socketio-adapter.registry';

/**
 * Socket.IO Redis adapter — bez ovoga, `NotificationsGateway` radi ISPRAVNO
 * samo dok postoji tačno jedna backend instanca (Socket.IO rooms/broadcast
 * su in-memory po defaultu). Sa Redis adapterom, `server.to(room).emit(...)`
 * radi ispravno bez obzira koja backend instanca je primila HTTP zahtjev
 * koji je izazvao emit, i bez obzira na koju je instancu klijent trenutno
 * WebSocket-om povezan — Redis Pub/Sub prenosi event između svih instanci.
 *
 * `createAdapter(..., { key: config.keyPrefix })` je OBAVEZAN: ioredis
 * `keyPrefix` se primjenjuje samo na komande sa ključevima, a PUBLISH/
 * (P)SUBSCRIBE ključeve nemaju. Bez adapter `key` opcije kanali bi ostali
 * `socket.io#…`, izvan `<prefix>:*` ACL pub/sub namespace-a, pa bi ih
 * centralna Redis platforma odbila (ili bi se miješali sa drugim
 * deploymentima na istom Redisu).
 *
 * Namjerno "graceful degradation": ako Redis nije dostupan pri startu, ili
 * ako ACL user nema prava na Pub/Sub kanale (Redis 7 `resetchannels`),
 * aplikacija NE pada — nastavlja sa default in-memory adapterom i loguje
 * upozorenje, te bilježi `mode: in_memory` za readiness. Bez preflighta bi
 * `psubscribe <prefix>:#/#*` odbijen sa NOPERM završio kao neuhvaćeni
 * ReplyError i srušio proces kada adapter kasnije napravi pretplatu.
 * Deploymenti sa više replika trebaju postaviti
 * SOCKETIO_REQUIRE_SHARED_ADAPTER=true; tada nedostupnost shared adaptera
 * puca pri startu umjesto tihe degradacije.
 */
const PROBE_TIMEOUT_MS = 5000;

/** Race a probe against a deadline without leaving an unhandled rejection. */
const withProbeTimeout = async <T>(work: Promise<T>, label: string): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${PROBE_TIMEOUT_MS}ms`)),
          PROBE_TIMEOUT_MS,
        );
        timer.unref();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

export class RedisIoAdapter extends IoAdapter {
  protected readonly logger = new Logger('SocketIO/RedisAdapter');
  private adapterConstructor?: ReturnType<typeof createAdapter>;
  private pubClient?: Redis;
  private subClient?: Redis;
  private mode: SocketIoAdapterMode = 'not_initialized';

  constructor(
    app: INestApplicationContext,
    private readonly corsOrigin: CorsOriginPolicy = true,
  ) {
    super(app);
  }

  getMode(): SocketIoAdapterMode {
    return this.mode;
  }

  /**
   * Redis 7 ACL users start with `resetchannels`: holding `~<prefix>:*` for
   * keys does NOT grant (P)SUBSCRIBE/PUBLISH on channels. Verify every channel
   * the adapter will use BEFORE `server.adapter()` is called — the adapter
   * library invokes `psubscribe()` without a callback, so a NOPERM rejection
   * there becomes an unhandled rejection that terminates the process with a
   * bare `ReplyError: NOPERM No permissions to access a channel`.
   */
  private async verifyPubSubAcl(
    config: ReturnType<typeof readRedisConfig>,
    pubClient: Redis,
    subClient: Redis,
  ): Promise<void> {
    const contract = buildSocketIoChannelContract(config.keyPrefix);
    // A separate connection avoids leaving the adapter's own subClient in a
    // half-subscribed state if the probe is denied.
    const probe = subClient.duplicate();
    try {
      await withProbeTimeout(
        (async () => {
          // Redis 7 compares PSUBSCRIBE patterns literally against `&` ACL
          // entries, so every namespace pattern needs its own exact grant.
          await probe.psubscribe(...contract.psubscribePatterns);
          await probe.subscribe(...contract.subscribeChannels);
          // This channel is deliberately outside the adapter's #/#* pattern,
          // so the probe cannot deliver a bogus message to other replicas.
          await pubClient.publish(contract.publishProbeChannel, 'acl-probe');
        })(),
        'Socket.IO Redis ACL Pub/Sub probe',
      );
    } catch (err) {
      logStructuredEvent(this.logger, 'error', {
        event: 'socketio_redis_acl_denied',
        mode: 'in_memory',
        redisUsername: config.username ?? 'default',
        channelNamespace: contract.keyPrefix,
        requiredChannelPattern: contract.recommendedAclChannelPattern,
        requiredChannelCount: contract.requiredChannels.length,
        error: safeErrorText(err),
      });
      throw new Error(
        `Redis ACL denied Socket.IO Pub/Sub channels for user "${config.username ?? 'default'}" ` +
          `(prefix "${contract.keyPrefix}"). Grant ${contract.recommendedAclChannelPattern} in ` +
          `acl/users.acl and reload the ACL; Redis 7 defaults to resetchannels. ` +
          `Required channels: ${contract.requiredChannels.join(', ')}. ` +
          `Cause: ${safeErrorText(err)}`,
        { cause: err },
      );
    } finally {
      probe.disconnect();
    }
  }

  async connectToRedis(): Promise<void> {
    const config = readRedisConfig();
    const { requireShared } = resolveSocketIoAdapterPolicy();
    let pubClient: Redis | undefined;
    let subClient: Redis | undefined;

    try {
      pubClient = new Redis({
        ...buildBaseRedisOptions(config),
        lazyConnect: false,
      });
      subClient = pubClient.duplicate();
      // Keep a listener so a later Redis failure cannot become an unhandled
      // 'error' event; the adapter registers its own friendly handler too.
      pubClient.on('error', () => {});
      subClient.on('error', () => {});

      await Promise.all([
        new Promise<void>((resolve, reject) => {
          pubClient?.once('ready', resolve);
          pubClient?.once('error', reject);
        }),
        new Promise<void>((resolve, reject) => {
          subClient?.once('ready', resolve);
          subClient?.once('error', reject);
        }),
      ]);

      if (!pubClient || !subClient) {
        throw new Error('Socket.IO Redis Pub/Sub clients were not created');
      }
      await this.verifyPubSubAcl(config, pubClient, subClient);

      this.pubClient = pubClient;
      this.subClient = subClient;
      this.adapterConstructor = createAdapter(pubClient, subClient, {
        key: config.keyPrefix,
      });
      this.mode = 'shared_redis';
      setActiveSocketIoAdapterMode('shared_redis');
      logStructuredEvent(this.logger, 'log', {
        event: 'socketio_redis_adapter_connected',
        mode: 'shared_redis',
        channelNamespace: config.keyPrefix,
        horizontallyScalable: true,
      });
    } catch (err) {
      pubClient?.disconnect();
      subClient?.disconnect();
      this.pubClient = undefined;
      this.subClient = undefined;
      this.adapterConstructor = undefined;
      this.mode = 'in_memory';
      setActiveSocketIoAdapterMode('in_memory');
      logStructuredEvent(this.logger, 'warn', {
        event: 'socketio_redis_adapter_fallback',
        mode: 'in_memory',
        requireShared,
        error: safeErrorText(err),
      });
      if (requireShared) {
        throw new Error(
          'Socket.IO shared Redis adapter is required (SOCKETIO_REQUIRE_SHARED_ADAPTER=true) but unavailable',
          { cause: err },
        );
      }
    }
  }

  /** Releases the dedicated pub/sub clients (tests, graceful shutdown). */
  async close(): Promise<void> {
    this.pubClient?.disconnect();
    this.subClient?.disconnect();
    this.pubClient = undefined;
    this.subClient = undefined;
    this.adapterConstructor = undefined;
    this.mode = 'not_initialized';
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, {
      ...options,
      cors: {
        ...(options?.cors ?? {}),
        origin: this.corsOrigin,
        credentials: true,
      },
    });
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }
}
