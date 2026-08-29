import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { Request } from 'express';
import { RedisService } from './redis.service';

/**
 * Fixed-window rate limit guard po klijentskoj IP adresi, primarno za
 * `POST /auth/login` (brute-force zaštita). Namjerno poseban, mali guard
 * (ne @nestjs/throttler + dodatni storage paket) — potreban je tačno jedan
 * obrazac (IP + route → brojač u prozoru), pa je jednostavniji, direktno
 * čitljiv Redis poziv bolji izbor od dodatne apstrakcije.
 *
 * Fail-closed prema Redis-u JE namjerno drugačije od cache-aside metoda u
 * RedisService: ako Redis nije dostupan, request se PROPUŠTA (fail-open)
 * uz upozorenje u logu — jer je posljedica fail-closed ponašanja ovdje
 * (blokiranje svih login pokušaja zbog pada Redis-a) gora od privremenog
 * gubitka brute-force zaštite. Odluka se svjesno razlikuje od
 * `acquireLock`, gdje je duplo izvršavanje cron posla gori ishod.
 */
@Injectable()
export class RedisRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RedisRateLimitGuard.name);
  private readonly limit: number;
  private readonly windowSeconds: number;
  private readonly keyPrefix: string;

  constructor(private readonly redisService: RedisService) {
    this.limit = Number(process.env.RATE_LIMIT_LOGIN_MAX ?? 10);
    this.windowSeconds = Number(process.env.RATE_LIMIT_LOGIN_WINDOW_SEC ?? 60);
    this.keyPrefix = 'ratelimit:login';
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const clientIp = this.resolveClientIp(request);
    const key = `${this.keyPrefix}:${clientIp}`;

    try {
      const count = await this.redisService.incrementRateLimitCounter(key, this.windowSeconds);
      if (count > this.limit) {
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: 'Previše pokušaja prijave. Pokušajte ponovo za kratko vrijeme.',
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      return true;
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      }
      // Redis nedostupan — fail-open (vidi obrazloženje iznad klase).
      this.logger.warn(`Rate limit check failed, allowing request through: ${String(err)}`);
      return true;
    }
  }

  private resolveClientIp(request: Request): string {
    // Zahtijeva `app.set('trust proxy', ...)` u main.ts (postavljeno) da bi
    // `request.ip` korektno pratio X-Forwarded-For iza Traefik/Coolify proxyja.
    return request.ip ?? 'unknown';
  }
}
