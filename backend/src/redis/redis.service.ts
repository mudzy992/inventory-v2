import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import { REDIS_CLIENT } from './redis.constants';

/**
 * Tanak, namjenski servis iznad opšteg ioredis klijenta. Namjerno ne
 * pokušava biti generički "Redis wrapper za sve" — izlaže samo obrasce
 * koje ova aplikacija stvarno koristi: cache-aside čitanje, distribuirani
 * lock (za cron/singleton operacije) i fixed-window rate limiting.
 *
 * Ako neka Redis operacija zakaže (konekcija pala, timeout), metode ovdje
 * NE bacaju grešku za cache-aside pozive — degradiraju na "cache miss"
 * (pozivalac uvijek dobija svjež podatak iz baze). Redis je optimizacija
 * performansi za ovu aplikaciju, ne kritična zavisnost za čitanje podataka
 * — aplikacija mora raditi (sporije) i ako je Redis privremeno nedostupan.
 * Distributed lock i rate-limit namjerno rade suprotno (fail-closed) jer
 * njihova svrha je sigurnosna/koordinaciona, ne performansna — vidi
 * dokumentaciju svake metode.
 */
@Injectable()
export class RedisService {
  private readonly logger = new Logger(RedisService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  /** Direktan pristup klijentu za slučajeve koje ovaj wrapper ne pokriva. */
  getClient(): Redis {
    return this.client;
  }

  // ---------------------------------------------------------------------
  // CACHE-ASIDE
  // ---------------------------------------------------------------------

  async getJson<T>(key: string): Promise<T | undefined> {
    try {
      const raw = await this.client.get(key);
      if (raw === null) {
        return undefined;
      }
      return JSON.parse(raw) as T;
    } catch (err) {
      this.logger.warn(`getJson(${key}) failed, treating as cache miss: ${String(err)}`);
      return undefined;
    }
  }

  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (err) {
      this.logger.warn(`setJson(${key}) failed (non-fatal): ${String(err)}`);
    }
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length === 0) {
      return;
    }
    try {
      await this.client.del(...keys);
    } catch (err) {
      this.logger.warn(`del(${keys.join(',')}) failed (non-fatal): ${String(err)}`);
    }
  }

  /** Briše sve ključeve po prefiksu (npr. `settings:*`). Koristi SCAN, ne
   * KEYS, da ne blokira event loop na velikom keyspace-u. */
  async delByPrefix(prefix: string): Promise<void> {
    try {
      const stream = this.client.scanStream({ match: `${prefix}*`, count: 100 });
      const keysToDelete: string[] = [];
      for await (const keys of stream) {
        keysToDelete.push(...(keys as string[]));
      }
      if (keysToDelete.length > 0) {
        // scanStream vraća ključeve BEZ ioredis keyPrefix-a već primijenjenog
        // (ioredis interno strippuje prefiks pri SCAN rezultatu), pa se
        // .del() poziva sa istim, nekvalifikovanim imenima — ioredis će
        // ponovo primijeniti keyPrefix konzistentno.
        await this.client.del(...keysToDelete);
      }
    } catch (err) {
      this.logger.warn(`delByPrefix(${prefix}) failed (non-fatal): ${String(err)}`);
    }
  }

  /** Cache-aside helper: vraća keširanu vrijednost ili je učitava preko
   * `loader`, kešira i vraća. Loader greške propagiraju (ne kešira se
   * neuspjeh), Redis greške NE propagiraju (fallback na direktan loader). */
  async remember<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
    const cached = await this.getJson<T>(key);
    if (cached !== undefined) {
      return cached;
    }
    const fresh = await loader();
    await this.setJson(key, fresh, ttlSeconds);
    return fresh;
  }

  // ---------------------------------------------------------------------
  // DISTRIBUTED LOCK (npr. singleton cron izvršavanje preko više replika)
  // ---------------------------------------------------------------------

  /**
   * Pokušava atomski zauzeti lock (`SET key token NX PX ttl`). Vraća
   * token (potreban za bezbjedan release) ili `null` ako je lock već
   * zauzet od nekog drugog procesa. Fail-closed: ako Redis nije dostupan,
   * baca grešku umjesto da tiho "dozvoli" izvršavanje — za operacije koje
   * zaštićuje ovaj lock (npr. dnevni cron), duplo izvršavanje je gori
   * ishod od preskočenog izvršavanja tog tick-a.
   */
  async acquireLock(key: string, ttlMs: number): Promise<string | null> {
    const token = randomUUID();
    const result = await this.client.set(key, token, 'PX', ttlMs, 'NX');
    return result === 'OK' ? token : null;
  }

  /** Oslobađa lock SAMO ako je token i dalje isti (spriječava da proces A
   * slučajno oslobodi lock koji je u međuvremenu zauzeo proces B nakon
   * isteka TTL-a). Lua skripta garantuje atomičnost GET+DEL provjere. */
  async releaseLock(key: string, token: string): Promise<void> {
    const script = `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("DEL", KEYS[1])
      else
        return 0
      end
    `;
    try {
      await this.client.eval(script, 1, key, token);
    } catch (err) {
      this.logger.warn(`releaseLock(${key}) failed (lock will expire via TTL): ${String(err)}`);
    }
  }

  // ---------------------------------------------------------------------
  // RATE LIMITING (fixed window, npr. login brute-force zaštita)
  // ---------------------------------------------------------------------

  /**
   * Fixed-window brojač: INCR + EXPIRE-na-prvom-hitu. Vraća trenutni broj
   * pogodaka u prozoru. Namjerno fixed-window (ne sliding) — jednostavnije,
   * atomično sa dvije komande, i dovoljno precizno za brute-force zaštitu
   * (dozvoljava kratkotrajni "burst" na granici prozora, što je prihvatljiv
   * kompromis za login endpoint, ne za npr. finansijske transakcije).
   * Fail-closed: greška Redis-a propagira se pozivaocu (guard odlučuje
   * kako reagovati — vidi RedisRateLimitGuard).
   */
  async incrementRateLimitCounter(key: string, windowSeconds: number): Promise<number> {
    const count = await this.client.incr(key);
    if (count === 1) {
      await this.client.expire(key, windowSeconds);
    }
    return count;
  }

  async ping(): Promise<boolean> {
    try {
      const reply = await this.client.ping();
      return reply === 'PONG';
    } catch {
      return false;
    }
  }
}
