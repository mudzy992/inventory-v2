import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Inject,
  HttpStatus,
  Optional,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Request } from 'express';
import { RedisService } from './redis.service';

export interface RedisRateLimitPolicy {
  readonly loggerContext: string;
  readonly maxEnvName: string;
  readonly windowEnvName: string;
  readonly failClosedEnvName: string;
  readonly defaultMax: number;
  readonly defaultWindowSeconds: number;
  readonly defaultFailClosed: boolean;
  readonly keyPrefix: string;
  readonly exceededMessage: string;
  readonly unavailableMessage: string;
}

export const LOGIN_RATE_LIMIT_POLICY: RedisRateLimitPolicy = {
  loggerContext: 'RedisRateLimitGuard',
  maxEnvName: 'RATE_LIMIT_LOGIN_MAX',
  windowEnvName: 'RATE_LIMIT_LOGIN_WINDOW_SEC',
  failClosedEnvName: 'RATE_LIMIT_LOGIN_FAIL_CLOSED',
  defaultMax: 10,
  defaultWindowSeconds: 60,
  defaultFailClosed: false,
  keyPrefix: 'ratelimit:login',
  exceededMessage: 'Previše pokušaja prijave. Pokušajte ponovo za kratko vrijeme.',
  unavailableMessage: 'Prijava trenutno nije dostupna. Pokušajte ponovo.',
};

/**
 * Fixed-window rate limit guard po klijentskoj IP adresi, sa zasebnim
 * Redis namespace-om i konfiguracijom za svaki endpoint policy.
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

const readFailClosed = (name: string, fallback: boolean): boolean => {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  if (raw.trim() === 'true') return true;
  if (raw.trim() === 'false') return false;
  throw new Error(`${name} must be either "true" or "false"`);
};

@Injectable()
export class RedisRateLimitGuard implements CanActivate {
  private readonly logger: Logger;
  private readonly limit: number;
  private readonly windowSeconds: number;
  private readonly failClosed: boolean;

  constructor(
    @Inject(RedisService) private readonly redisService: RedisService,
    @Optional() policy: RedisRateLimitPolicy = LOGIN_RATE_LIMIT_POLICY,
  ) {
    this.logger = new Logger(policy.loggerContext);
    this.limit = readPositiveInteger(policy.maxEnvName, policy.defaultMax);
    this.windowSeconds = readPositiveInteger(policy.windowEnvName, policy.defaultWindowSeconds);
    this.failClosed = readFailClosed(policy.failClosedEnvName, policy.defaultFailClosed);
    this.keyPrefix = policy.keyPrefix;
    this.exceededMessage = policy.exceededMessage;
    this.unavailableMessage = policy.unavailableMessage;
  }

  private readonly keyPrefix: string;
  private readonly exceededMessage: string;
  private readonly unavailableMessage: string;

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
            message: this.exceededMessage,
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
        this.logger.error(`Rate limit check failed; rejecting request while Redis is unavailable: ${String(err)}`);
        throw new ServiceUnavailableException(this.unavailableMessage);
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
