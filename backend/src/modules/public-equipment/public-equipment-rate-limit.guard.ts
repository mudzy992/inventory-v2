import { Injectable } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import { RedisRateLimitGuard } from '../../redis/redis-rate-limit.guard';

@Injectable()
export class PublicEquipmentRateLimitGuard extends RedisRateLimitGuard {
  constructor(redisService: RedisService) {
    super(redisService, {
      loggerContext: PublicEquipmentRateLimitGuard.name,
      maxEnvName: 'RATE_LIMIT_PUBLIC_EQUIPMENT_MAX',
      windowEnvName: 'RATE_LIMIT_PUBLIC_EQUIPMENT_WINDOW_SEC',
      failClosedEnvName: 'RATE_LIMIT_PUBLIC_EQUIPMENT_FAIL_CLOSED',
      defaultMax: 60,
      defaultWindowSeconds: 60,
      defaultFailClosed: false,
      keyPrefix: 'ratelimit:public-equipment',
      exceededMessage: 'Previše zahtjeva za javni pregled opreme. Pokušajte ponovo kasnije.',
      unavailableMessage: 'Javni pregled opreme trenutno nije dostupan. Pokušajte ponovo.',
    });
  }
}
