import { execFile } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface HealthState {
  redisReady: boolean;
  shuttingDown: boolean;
}

/**
 * Health server je NAMJERNO vezan SAMO za 127.0.0.1 (loopback) — servis
 * nema javnu domenu niti je izložen u docker-compose (nema `ports:`/
 * `expose:`), a Docker `HEALTHCHECK` izvršava komande UNUTAR mrežnog
 * namespace-a kontejnera, pa loopback bind i dalje radi za healthcheck
 * svrhu bez ikakve mrežne izloženosti ka drugim kontejnerima ili internetu.
 *
 * Provjerava dvije stvari:
 *  - da je `soffice` binarni fajl uopšte pokretljiv (brz `--version` poziv,
 *    keširan nakon prvog uspjeha da health provjere ne pokreću soffice
 *    stalno),
 *  - da je BullMQ Worker-ova Redis konekcija u 'ready' stanju (postavlja se
 *    iz index.ts preko `worker.on('ready'/'error')`).
 */
export const startHealthServer = (
  port: number,
  sofficeBinary: string,
  state: HealthState,
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
      if (!sofficeVerifiedOnce) {
        try {
          await execFileAsync(sofficeBinary, ['--version'], { timeout: 5000 });
          sofficeVerifiedOnce = true;
        } catch (err) {
          res.writeHead(503, { 'Content-Type': 'application/json' }).end(
            JSON.stringify({ status: 'soffice_unavailable', error: String(err) }),
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
