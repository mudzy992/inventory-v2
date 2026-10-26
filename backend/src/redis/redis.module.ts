import { Global, Injectable, Inject, Module, type OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { writeStructuredLog } from '../common/logging/structured-log.util';
import { attachRedisConnectionObservers } from './redis-connection.registry';
import { buildBaseRedisOptions, readRedisConfig } from './redis.config';
import { REDIS_CLIENT } from './redis.constants';
import { RedisService } from './redis.service';

@Injectable()
class RedisClientCloser implements OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  onModuleDestroy(): void {
    writeStructuredLog('log', { event: 'redis_client_shutdown' });
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
        const config = readRedisConfig();
        const client = new Redis({
          ...buildBaseRedisOptions(config),
          keyPrefix: config.keyPrefix,
          lazyConnect: false,
        });
        attachRedisConnectionObservers(client);
        return client;
      },
    },
    RedisClientCloser,
    RedisService,
  ],
  exports: [REDIS_CLIENT, RedisService],
})
export class RedisModule {}
