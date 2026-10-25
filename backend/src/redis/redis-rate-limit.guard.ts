import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
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
 * Redis outage policy is configurable with RATE_LIMIT_LOGIN_FAIL_CLOSED.
 * Default false preserves availability (fail-open); true rejects login with
 * 503 until Redis recovers. This is deliberately distinct from cache-aside
 * behavior, and independent from the security-sensitive distributed lock.
 */
const readPositiveInteger = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const normalized = raw.trim();
  if (!/^\d+$/u.test(normalized)) {
    throw new Error(`${name} must be a positive safe integer`);
  }
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive safe integer`);
  }
  return parsed;
};

const readFailClosed = (): boolean => {
  const raw = process.env.RATE_LIMIT_LOGIN_FAIL_CLOSED;
  if (raw === undefined || raw.trim() === '') return false;
  if (raw.trim() === 'true') return true;
  if (raw.trim() === 'false') return false;
  throw new Error('RATE_LIMIT_LOGIN_FAIL_CLOSED must be either "true" or "false"');
};

@Injectable()
export class RedisRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RedisRateLimitGuard.name);
  private readonly limit: number;
  private readonly windowSeconds: number;
  private readonly failClosed: boolean;
  private readonly keyPrefix: string;

  constructor(private readonly redisService: RedisService) {
    this.limit = readPositiveInteger('RATE_LIMIT_LOGIN_MAX', 10);
    this.windowSeconds = readPositiveInteger('RATE_LIMIT_LOGIN_WINDOW_SEC', 60);
    this.failClosed = readFailClosed();
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
      if (this.failClosed) {
        this.logger.error(`Rate limit check failed; rejecting login while Redis is unavailable: ${String(err)}`);
        throw new ServiceUnavailableException('Prijava trenutno nije dostupna. Pokušajte ponovo.');
      }
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
