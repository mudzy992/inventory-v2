import { Inject, Injectable } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import {
  AUTH_SESSION_RATE_LIMIT_POLICY,
  RedisRateLimitGuard,
} from '../../redis/redis-rate-limit.guard';

/** N-11: refresh/logout get their own, more generous bucket (login stays at 10/min). */
@Injectable()
export class AuthSessionRateLimitGuard extends RedisRateLimitGuard {
  constructor(@Inject(RedisService) redisService: RedisService) {
    super(redisService, AUTH_SESSION_RATE_LIMIT_POLICY);
  }
}
