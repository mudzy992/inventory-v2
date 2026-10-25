import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { Controller, Get, Inject, Module, Param, UseGuards } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PublicEquipmentRateLimitGuard } from './public-equipment-rate-limit.guard';
import { PublicEquipmentService } from './public-equipment.service';
import { RedisService } from '../../redis/redis.service';

const previousLimit = process.env.RATE_LIMIT_PUBLIC_EQUIPMENT_MAX;
const previousWindow = process.env.RATE_LIMIT_PUBLIC_EQUIPMENT_WINDOW_SEC;
const previousFailClosed = process.env.RATE_LIMIT_PUBLIC_EQUIPMENT_FAIL_CLOSED;
const requestCounts = new Map<string, number>();
let serviceCallCount = 0;

@Controller('public/equipment')
class RateLimitedPublicEquipmentTestController {
  constructor(
    @Inject(PublicEquipmentService)
    private readonly publicEquipmentService: PublicEquipmentService,
  ) {}

  @Get(':id')
  @UseGuards(PublicEquipmentRateLimitGuard)
  findOne(@Param('id') id: string) {
    return this.publicEquipmentService.findOne(id);
  }
}

@Module({
  controllers: [RateLimitedPublicEquipmentTestController],
  providers: [
    PublicEquipmentRateLimitGuard,
    {
      provide: PublicEquipmentService,
      useValue: {
        findOne: async (id: string) => {
          serviceCallCount += 1;
          return { id };
        },
      },
    },
    {
      provide: RedisService,
      useValue: {
        incrementRateLimitCounter: async (key: string) => {
          const count = (requestCounts.get(key) ?? 0) + 1;
          requestCounts.set(key, count);
          return count;
        },
      },
    },
  ],
})
class PublicEquipmentRateLimitHttpTestModule {}

test('public equipment HTTP route enforces the Redis IP limit before calling its service', async () => {
  process.env.RATE_LIMIT_PUBLIC_EQUIPMENT_MAX = '2';
  process.env.RATE_LIMIT_PUBLIC_EQUIPMENT_WINDOW_SEC = '60';
  process.env.RATE_LIMIT_PUBLIC_EQUIPMENT_FAIL_CLOSED = 'false';
  requestCounts.clear();
  serviceCallCount = 0;

  const app = await NestFactory.create(PublicEquipmentRateLimitHttpTestModule, { logger: ['error'] });
  try {
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as AddressInfo;
    const url = `http://127.0.0.1:${address.port}/public/equipment/equipment-1`;

    const first = await fetch(url);
    const firstBody = await first.text();
    assert.equal(first.status, 200, firstBody);
    assert.deepEqual(JSON.parse(firstBody), { id: 'equipment-1' });

    const second = await fetch(url);
    assert.equal(second.status, 200);

    const third = await fetch(url);
    assert.equal(third.status, 429);
    assert.equal(requestCounts.get('ratelimit:public-equipment:127.0.0.1'), 3);
    assert.equal(serviceCallCount, 2, 'the rejected request must not reach the equipment service');
  } finally {
    await app.close();
    if (previousLimit === undefined) delete process.env.RATE_LIMIT_PUBLIC_EQUIPMENT_MAX;
    else process.env.RATE_LIMIT_PUBLIC_EQUIPMENT_MAX = previousLimit;
    if (previousWindow === undefined) delete process.env.RATE_LIMIT_PUBLIC_EQUIPMENT_WINDOW_SEC;
    else process.env.RATE_LIMIT_PUBLIC_EQUIPMENT_WINDOW_SEC = previousWindow;
    if (previousFailClosed === undefined) delete process.env.RATE_LIMIT_PUBLIC_EQUIPMENT_FAIL_CLOSED;
    else process.env.RATE_LIMIT_PUBLIC_EQUIPMENT_FAIL_CLOSED = previousFailClosed;
  }
});
