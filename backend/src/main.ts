import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

loadEnv({ path: resolve(process.cwd(), '../.env') });
loadEnv({ path: resolve(process.cwd(), '.env') });

const bootstrap = async (): Promise<void> => {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // API_PREFIX namjerno može biti prazan string (backend na svojoj subdomeni,
  // bez path-prefiksa) — ConfigService.get koristi default SAMO ako je vrijednost
  // undefined, pa prazan string iz env-a ostaje prazan string (očekivano).
  const apiPrefix = configService.get<string>('API_PREFIX', 'backend');
  app.setGlobalPrefix(apiPrefix);

  // CORS_ORIGIN podržava jednu ili više (zarezom odvojenih) dozvoljenih domena.
  // Ako varijabla uopšte nije definisana, fallback je "true" (reflektuje Origin
  // header — dozvoljeno sve, korisno samo za dev/debug, NIKAD ne kombinovati
  // wildcard "*" sa credentials:true jer je to nevažeća CORS kombinacija koju
  // browser odbija).
  const rawCorsOrigin = configService.get<string>('CORS_ORIGIN');
  const corsOrigins = rawCorsOrigin
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const corsOrigin: boolean | string | string[] =
    corsOrigins && corsOrigins.length > 0 ? corsOrigins : true;

  app.enableCors({
    origin: corsOrigin,
    credentials: true,
  });

  // Namjerno logovano pri svakom pokretanju — najbrži način da se u Coolify
  // logovima potvrdi da su API_PREFIX i CORS_ORIGIN stvarno stigli iz env-a
  // onako kako se očekuje, bez potrebe za exec-om u kontejner.
  logger.log(`API_PREFIX="${apiPrefix}" (prazno = bez path-prefiksa)`);
  logger.log(`CORS_ORIGIN resolved to: ${JSON.stringify(corsOrigin)}`);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  const port = Number(configService.get<string>('BACKEND_PORT', '3000'));
  await app.listen(port);
  logger.log(`Backend listening on port ${port}`);
};

void bootstrap();

