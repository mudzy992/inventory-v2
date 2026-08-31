import { loadConfig } from './config';
import { startHealthServer, type HealthState } from './health-server';
import { createDocumentWorker } from './worker';

const log = (msg: string): void => {
  // eslint-disable-next-line no-console
  console.log(`[document-worker] ${new Date().toISOString()} ${msg}`);
};

const main = (): void => {
  const config = loadConfig();
  log(
    `starting — queue="${config.queueName}" redis=${config.redis.host}:${config.redis.port} ` +
      `prefix="${config.redis.keyPrefix}" concurrency=${config.concurrency} ` +
      `convertTimeoutMs=${config.convertTimeoutMs} uploadDir="${config.uploadDir}"`,
  );

  const healthState: HealthState = { redisReady: false, shuttingDown: false };
  const healthServer = startHealthServer(config.healthPort, config.sofficeBinary, healthState);
  log(`health endpoint listening on 127.0.0.1:${config.healthPort}/health (internal only)`);

  const worker = createDocumentWorker(config);
  worker.on('ready', () => {
    healthState.redisReady = true;
    log('BullMQ worker connected to Redis, ready to process jobs');
  });
  worker.on('error', () => {
    // Ne rušimo redisReady na svaku prolaznu grešku — ioredis se sam
    // rekonektuje; ako konekcija stvarno propadne trajno, healthcheck
    // failovi na 'redis_not_ready' bi ionako pratili status 'close'.
  });

    // worker close se ne koristi više, jer se healthState.redisReady ne bi smio resetovati na false dok
    // se ne završe svi aktivni poslovi (worker.close() čeka da se završe) — inače bi healthcheck failovi
    // mogli izazvati restart dok se još radi na aktivnim poslovima.
    //   worker.on('close', () => {
    //     healthState.redisReady = false;
    //   });

  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    healthState.shuttingDown = true;
    log(`received ${signal}, starting graceful shutdown (waiting for active jobs to finish)...`);

    // worker.close() čeka da se AKTIVNI poslovi završe (do internog
    // lock/shutdown timeout-a) prije nego zatvori Redis konekciju — zato
    // Docker Compose `stop_grace_period` za ovaj servis mora biti veći od
    // najdužeg očekivanog soffice poziva (vidi docker-compose.yml /
    // docker-compose.prod.yml komentar uz document-worker servis).
    void worker
      .close()
      .catch((err) => {
        log(`error during worker.close(): ${String(err)}`);
      })
      .finally(() => {
        healthServer.close();
        log('shutdown complete, exiting');
        process.exit(0);
      });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

main();
