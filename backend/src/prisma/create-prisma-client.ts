import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { resolveDatabaseConfig } from './database-config.util';

export { resolveDatabaseConfig } from './database-config.util';

export const createPrismaClientOptions = (): ConstructorParameters<typeof PrismaClient>[0] => {
  const config = resolveDatabaseConfig();
  const adapter = new PrismaPg({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    ssl: config.ssl,
    max: 10,
  });
  return { adapter };
};

export const createPrismaClient = (): PrismaClient => new PrismaClient(createPrismaClientOptions());
