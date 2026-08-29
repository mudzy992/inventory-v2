import { Global, Injectable, Inject, Logger, Module, type OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { buildBaseRedisOptions, readRedisConfig } from './redis.config';
import { REDIS_CLIENT } from './redis.constants';
import { RedisService } from './redis.service';

@Injectable()
class RedisClientCloser implements OnModuleDestroy {
  private readonly logger = new Logger('Redis');
  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}
  onModuleDestroy(): void {
    this.logger.log('Closing Redis connection (app shutdown)...');
    this.client.disconnect();
  }
}

/**
 * Globalni Redis modul — jedan opšti, dugotrajni ioredis klijent
 * (cache, distributed lock, rate limiting) dostupan svugdje u aplikaciji
 * bez ponovnog importovanja. Socket.IO adapter i BullMQ prave SVOJE
 * posebne konekcije (vidi redis-io.adapter.ts i queues/bullmq.module.ts)
 * jer imaju drugačije zahtjeve (pub/sub duplex konekcije, odsustvo
 * ioredis keyPrefix-a).
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (): Redis => {
        const logger = new Logger('Redis');
        const config = readRedisConfig();
        const client = new Redis({
          ...buildBaseRedisOptions(config),
          keyPrefix: config.keyPrefix,
          lazyConnect: false,
        });
        client.on('connect', () => logger.log(`Connecting to Redis ${config.host}:${config.port}...`));
        client.on('ready', () => logger.log(`Redis ready (keyPrefix="${config.keyPrefix}")`));
        client.on('error', (err) => logger.error(`Redis connection error: ${err.message}`));
        client.on('close', () => logger.warn('Redis connection closed'));
        return client;
      },
    },
    RedisClientCloser,
    RedisService,
  ],
  exports: [REDIS_CLIENT, RedisService],
})
export class RedisModule {}
