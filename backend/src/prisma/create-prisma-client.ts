import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { writeStructuredLog } from '../common/logging/structured-log.util';
import { redactSensitiveText } from '../common/utils/redact-log.util';
import { PrismaClient } from '../../generated/prisma/client';
import { resolveDatabaseConfig, resolveDatabasePoolMax } from './database-config.util';
import { setActivePostgresPool } from './postgres-pool.registry';

export { resolveDatabaseConfig } from './database-config.util';
export { resolveDatabasePoolMax } from './database-config.util';

/** Pool errors can happen before Nest installs its global JSON logger. Emit a
 * single structured line so collectors parse them like the other events. */
const logPoolError = (event: 'postgres_pool_error' | 'postgres_connection_error') =>
  (error: Error): void => {
    writeStructuredLog('error', {
      event,
      message: redactSensitiveText(error.message),
    });
  };

export const createPrismaClientOptions = (): ConstructorParameters<typeof PrismaClient>[0] => {
  const config = resolveDatabaseConfig();
  const pool = new Pool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    ssl: config.ssl,
    max: resolveDatabasePoolMax(),
  });
  setActivePostgresPool(pool);
  const adapter = new PrismaPg(pool, {
    disposeExternalPool: true,
    onPoolError: logPoolError('postgres_pool_error'),
    onConnectionError: logPoolError('postgres_connection_error'),
  });
  return { adapter };
};

export const createPrismaClient = (): PrismaClient => new PrismaClient(createPrismaClientOptions());
