import { logStructuredEvent } from './common/logging/structured-event.logger';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { RedisIoAdapter } from './redis/redis-io.adapter';
import { resolveCorsOriginPolicy } from './common/utils/cors-origins.util';
import { CorrelationLogger } from './common/logging/correlation.logger';
import { correlationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { CORRELATION_ID_RESPONSE_HEADER } from './common/utils/correlation-id.util';
import { RedisService } from './redis/redis.service';
import {
  globalRateLimitMiddleware,
  resolveGlobalRateLimitPolicy,
  resolveSecurityHeadersPolicy,
  securityHeadersMiddleware,
} from './common/http/http-hardening.util';

loadEnv({ path: resolve(process.cwd(), '../.env') });
loadEnv({ path: resolve(process.cwd(), '.env') });

const bootstrap = async (): Promise<void> => {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: new CorrelationLogger(),
  });
  const configService = app.get(ConfigService);
  app.use(correlationIdMiddleware);

  // Backend je uvijek iza Traefik/Coolify reverse proxyja u produkciji —
  // bez ovoga, `request.ip` (koristi ga npr. RedisRateLimitGuard) bi
  // vidio internu Docker network IP proxyja umjesto stvarnog klijenta.
  app.set('trust proxy', 1);

  // HTTP hardening: safe security-header subset always available (reversible
  // via env), plus an OPT-IN global rate limit. CSP is deliberately not set —
  // the generated transfer document is text/html with inline styling, so a
  // policy there remains an explicit owner decision.
  const expressApp = app.getHttpAdapter().getInstance() as {
    disable: (setting: string) => void;
  };
  expressApp.disable('x-powered-by');
  const securityHeadersPolicy = resolveSecurityHeadersPolicy(process.env);
  const globalRateLimitPolicy = resolveGlobalRateLimitPolicy(process.env);
  app.use(securityHeadersMiddleware(securityHeadersPolicy));
  if (globalRateLimitPolicy.enabled) {
    const redisService = app.get(RedisService);
    app.use(
      globalRateLimitMiddleware(globalRateLimitPolicy, (key, windowSeconds) =>
        redisService.incrementRateLimitCounter(key, windowSeconds),
      ),
    );
  }

  const corsOrigin = resolveCorsOriginPolicy(
    configService.get<string>('CORS_ORIGIN'),
    configService.get<string>('NODE_ENV') === 'production',
  );

  // Socket.IO Redis adapter — omogućava da NotificationsGateway ispravno
  // broadcast-uje evente bez obzira na broj backend replika. Bezbjedno i
  // za single-instance deployment (graceful fallback ako Redis nije
  // dostupan pri startu — vidi RedisIoAdapter). Ista allow-lista važi za
  // HTTP i WebSocket handshakes.
  const redisIoAdapter = new RedisIoAdapter(app, corsOrigin);
  await redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);

  // API_PREFIX namjerno može biti prazan string (backend na svojoj subdomeni,
  // bez path-prefiksa) — ConfigService.get koristi default SAMO ako je vrijednost
  // undefined, pa prazan string iz env-a ostaje prazan string (očekivano).
  const apiPrefix = configService.get<string>('API_PREFIX', 'backend');
  app.setGlobalPrefix(apiPrefix);

  // U produkciji resolveCorsOriginPolicy odbija praznu/wildcard allow-listu;
  // samo dev režim smije reflektovati Origin radi lokalnog razvoja.
  app.enableCors({
    origin: corsOrigin,
    credentials: true,
    exposedHeaders: [CORRELATION_ID_RESPONSE_HEADER],
  });

  // Namjerno logovano pri svakom pokretanju — najbrži način da se u Coolify
  // logovima potvrdi da su API_PREFIX i CORS_ORIGIN stvarno stigli iz env-a
  // onako kako se očekuje, bez potrebe za exec-om u kontejner.
  logStructuredEvent(logger, 'log', {
    event: 'backend_bootstrap_config',
    apiPrefix,
    corsOrigin,
  });
  logStructuredEvent(logger, 'log', {
    event: 'http_hardening_config',
    securityHeadersEnabled: securityHeadersPolicy.enabled,
    hstsMaxAgeSeconds: securityHeadersPolicy.hstsMaxAgeSeconds,
    globalRateLimitEnabled: globalRateLimitPolicy.enabled,
    globalRateLimitMax: globalRateLimitPolicy.max,
    globalRateLimitWindowSeconds: globalRateLimitPolicy.windowSeconds,
    globalRateLimitFailClosed: globalRateLimitPolicy.failClosed,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  const port = Number(configService.get<string>('BACKEND_PORT', '3000'));
  await app.listen(port);
  logStructuredEvent(logger, 'log', { event: 'backend_listening', port });
};

void bootstrap();

