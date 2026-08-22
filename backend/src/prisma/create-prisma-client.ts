import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';

interface DatabaseConnectionConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

const parseDatabaseUrl = (databaseUrl: string): DatabaseConnectionConfig => {
  const parsed = new URL(databaseUrl);
  const database = parsed.pathname.replace(/^\//, '');
  if (!database) {
    throw new Error('DATABASE_URL must include a database name');
  }
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 5432,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database,
  };
};

export const resolveDatabaseConfig = (): DatabaseConnectionConfig => {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    return parseDatabaseUrl(databaseUrl);
  }
  const host = process.env.DATABASE_HOST;
  const user = process.env.DATABASE_USER;
  const password = process.env.DATABASE_PASSWORD;
  const database = process.env.DATABASE_NAME;
  if (!host || !user || password === undefined || !database) {
    throw new Error('Set DATABASE_URL or DATABASE_HOST/USER/PASSWORD/NAME');
  }
  return {
    host,
    port: Number(process.env.DATABASE_PORT ?? 5432),
    user,
    password,
    database,
  };
};

export const createPrismaClientOptions = (): ConstructorParameters<typeof PrismaClient>[0] => {
  const config = resolveDatabaseConfig();
  const adapter = new PrismaPg({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    max: 10,
  });
  return { adapter };
};

export const createPrismaClient = (): PrismaClient => new PrismaClient(createPrismaClientOptions());
