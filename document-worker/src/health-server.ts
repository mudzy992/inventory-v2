import { execFile } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface HealthState {
  redisReady: boolean;
  shuttingDown: boolean;
}

/**
 * Health server is bound to loopback because Docker executes its HEALTHCHECK
 * inside the container network namespace. The Redis probe is live (not just a
 * one-time connection event), while the soffice binary check is cached after
 * the first successful invocation to avoid starting LibreOffice every 30s.
 */
export const startHealthServer = (
  port: number,
  sofficeBinary: string,
  state: HealthState,
  checkRedis: () => Promise<void>,
): Server => {
  let sofficeVerifiedOnce = false;

  const server = createServer((req, res) => {
    void (async () => {
      if (req.url !== '/health') {
        res.writeHead(404).end();
        return;
      }
      if (state.shuttingDown) {
        res.writeHead(503, { 'Content-Type': 'application/json' }).end(
          JSON.stringify({ status: 'shutting_down' }),
        );
        return;
      }
      if (!state.redisReady) {
        res.writeHead(503, { 'Content-Type': 'application/json' }).end(
          JSON.stringify({ status: 'redis_not_ready' }),
        );
        return;
      }
      try {
        await checkRedis();
      } catch {
        res.writeHead(503, { 'Content-Type': 'application/json' }).end(
          JSON.stringify({ status: 'redis_not_ready' }),
        );
        return;
      }
      if (!sofficeVerifiedOnce) {
        try {
          await execFileAsync(sofficeBinary, ['--version'], { timeout: 5000 });
          sofficeVerifiedOnce = true;
        } catch {
          res.writeHead(503, { 'Content-Type': 'application/json' }).end(
            JSON.stringify({ status: 'soffice_unavailable' }),
          );
          return;
        }
      }
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ status: 'ok' }));
    })();
  });

  server.listen(port, '127.0.0.1');
  return server;
};
