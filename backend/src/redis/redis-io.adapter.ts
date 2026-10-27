import { Logger } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import type { Server, ServerOptions } from 'socket.io';
import { logStructuredEvent, safeErrorText } from '../common/logging/structured-event.logger';
import type { CorsOriginPolicy } from '../common/utils/cors-origins.util';
import { buildBaseRedisOptions, readRedisConfig } from './redis.config';
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
 * Namjerno "graceful degradation": ako Redis nije dostupan pri startu,
 * aplikacija NE pada — nastavlja sa default in-memory adapterom i loguje
 * upozorenje, te bilježi `mode: in_memory` za readiness. Deploymenti sa više
 * replika trebaju postaviti SOCKETIO_REQUIRE_SHARED_ADAPTER=true; tada
 * nedostupnost shared adaptera puca pri startu umjesto tihe degradacije.
 */
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
