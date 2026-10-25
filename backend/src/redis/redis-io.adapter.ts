import { Logger } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import type { Server, ServerOptions } from 'socket.io';
import type { CorsOriginPolicy } from '../common/utils/cors-origins.util';
import { buildBaseRedisOptions, readRedisConfig } from './redis.config';

/**
 * Socket.IO Redis adapter — bez ovoga, `NotificationsGateway` radi ISPRAVNO
 * samo dok postoji tačno jedna backend instanca (Socket.IO rooms/broadcast
 * su in-memory po defaultu). Sa Redis adapterom, `server.to(room).emit(...)`
 * radi ispravno bez obzira koja backend instanca je primila HTTP zahtjev
 * koji je izazvao emit, i bez obzira na koju je instancu klijent trenutno
 * WebSocket-om povezan — Redis Pub/Sub prenosi event između svih instanci.
 *
 * Ovo je preduslov za bilo kakvo buduće horizontalno skaliranje backend-a
 * (dvije ili više replika iza istog load balancer-a) — bez njega, notifikacije
 * i real-time eventi (inventory.close_job.updated, settings.updated) bi
 * stizali samo dijelu povezanih klijenata.
 *
 * Namjerno "graceful degradation": ako Redis nije dostupan pri startu,
 * aplikacija NE pada — nastavlja sa default in-memory adapterom i loguje
 * upozorenje. Ispravno je da se cijela aplikacija ne obori zbog privremenog
 * Redis prekida, single-instance Socket.IO ponašanje je i dalje funkcionalno.
 */
export class RedisIoAdapter extends IoAdapter {
  protected readonly logger = new Logger('SocketIO/RedisAdapter');
  private adapterConstructor?: ReturnType<typeof createAdapter>;

  constructor(
    app: INestApplicationContext,
    private readonly corsOrigin: CorsOriginPolicy = true,
  ) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    const config = readRedisConfig();
    try {
      const pubClient = new Redis({
        ...buildBaseRedisOptions(config),
        keyPrefix: config.keyPrefix, // usklađeno sa ACL &<app-prefix>:* pubsub restrikcijom
        lazyConnect: false,
      });
      const subClient = pubClient.duplicate();

      await Promise.all([
        new Promise<void>((resolve, reject) => {
          pubClient.once('ready', resolve);
          pubClient.once('error', reject);
        }),
        new Promise<void>((resolve, reject) => {
          subClient.once('ready', resolve);
          subClient.once('error', reject);
        }),
      ]);

      this.adapterConstructor = createAdapter(pubClient, subClient);
      this.logger.log('Socket.IO Redis adapter connected — WebSocket broadcast now horizontally scalable.');
    } catch (err) {
      this.logger.warn(
        `Socket.IO Redis adapter connection failed, falling back to in-memory adapter ` +
          `(OK for single-instance deployment, NOT sufficient if scaled horizontally): ${String(err)}`,
      );
    }
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
