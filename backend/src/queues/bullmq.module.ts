import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { buildBullMqRedisOptions, readRedisConfig } from '../redis/redis.config';

/**
 * Globalna BullMQ konekcija. Namjerno POSEBNA ioredis konekcija od opšteg
 * RedisService klijenta (redis.module.ts) — BullMQ NE koristi ioredis
 * `keyPrefix` (nezvanično podržana kombinacija sa internim Lua skriptama),
 * nego svoju vlastitu `prefix` opciju, koja radi na istom principu ali je
 * BullMQ-native i garantovano ispravna. Krajnji rezultat je ekvivalentan:
 * BullMQ ključevi izgledaju kao `${REDIS_KEY_PREFIX}:<queueName>:<...>`,
 * unutar istog ACL `~<prefix>:*` namespace-a kao i ostatak aplikacije.
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      useFactory: () => {
        const config = readRedisConfig();
        return {
          connection: buildBullMqRedisOptions(config),
          prefix: config.keyPrefix.replace(/:$/, ''),
          defaultJobOptions: {
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 },
            // Ne brišemo automatski — završeni/neuspjeli poslovi ostaju
            // kratko vidljivi radi debug-a; produkcijski TTL čišćenja.
            removeOnComplete: { age: 24 * 60 * 60, count: 1000 },
            removeOnFail: { age: 7 * 24 * 60 * 60 },
          },
        };
      },
    }),
  ],
  exports: [BullModule],
})
export class QueuesModule {}
