# Redis ACL — `inventory-v2` korisnik i Pub/Sub kanali

Ovaj dokument je operativni odgovor na grešku:

```
BullMQ: WARNING! Your redis options maxRetriesPerRequest must be null and will be overridden by BullMQ.
ReplyError: NOPERM No permissions to access a channel
    command: { name: 'psubscribe', args: [ 'inventory-v2:#/#*' ] }
```

## Šta se desilo

`RedisIoAdapter` (`backend/src/redis/redis-io.adapter.ts`) namjerno postavlja
`createAdapter(pubClient, subClient, { key: config.keyPrefix })`. Time se svi
Socket.IO Pub/Sub kanali sele u `${REDIS_KEY_PREFIX}:*` namespace — konkretno
`PSUBSCRIBE inventory-v2:#/#*` za root namespace, plus `SUBSCRIBE` na
`inventory-v2:-request#/#`, `inventory-v2:-response#/#` i
`inventory-v2:-response#/#<uid>#`. To je ispravka ranijeg stanja u kojem su
kanali bili `socket.io#…` i mogli su se miješati sa drugim deploymentima na
istom Redisu.

**Redis ACL ima dvije nezavisne ose dozvola.** `~<prefix>:*` dozvoljava
ključeve; `&<prefix>:*` dozvoljava Pub/Sub kanale. Od Redis 7 novi ACL user
starta sa `resetchannels`, pa korisnik koji ima samo `~inventory-v2:*` može
čitati i pisati ključeve, ali ne smije `PSUBSCRIBE` — zato `NOPERM`. Ranije
stanje nije koristilo nijedan kanal ispod tog prefiksa koji bi zahtijevao
glob pattern (BullMQ uglavnom koristi streamove), pa problem nije bio vidljiv.

`BullMQ: WARNING! Your redis options maxRetriesPerRequest must be null…` je
druga, odvojena (kozmetička) greška: BullMQ interno forsira `null`, a mi smo mu
slali `3`. Ispravljeno je kroz `buildBullMqRedisOptions()` u backendu i
document-workeru; opšti Redis klijent i Socket.IO adapter i dalje koriste `3`.

## Šta uraditi na Redis platformi

1. Provjeriti stvarno stanje korisnika (ne ono što piše u fajlu):

   ```sh
   redis-cli -a "$REDIS_ADMIN_PASSWORD" ACL GETUSER inventory-v2
   ```

   Obratiti pažnju na red `channels` — mora sadržavati `inventory-v2:*`
   (ili `allchannels`). Ako piše `-@all` kanala / `""`, to je uzrok.

2. Ažurirati `acl/users.acl` po šablonu
   [`deploy/redis/users.acl.example`](../deploy/redis/users.acl.example):

   ```sh
   # <PREFIX> = REDIS_KEY_PREFIX bez dvotačke, npr. inventory-v2
   user inventory-v2 on ><JAKA_LOZINKA> \
     ~inventory-v2:* &inventory-v2:* \
     +@all -@admin -@dangerous
   ```

   Alternativno, bez restarta config fajla:

   ```sh
   redis-cli -a "$REDIS_ADMIN_PASSWORD" \
     ACL SETUSER inventory-v2 on '~inventory-v2:*' '&inventory-v2:*' \
     +@all -@admin -@dangerous
   ```

   Napomena: `-@dangerous` ne smije ukloniti `EVAL`/`EVALSHA` — BullMQ ih
   koristi za Lua skripte. Ako platforma koristi užu allowlistu kategorija,
   obavezno zadržati `@pubsub`, `@scripting`, `@blocking`, `@stream`, `@list`,
   `@sortedset`, `@hash`, `@set`, `@string`, `@keyspace`, `@read`, `@write`,
   `@slow` i `@connection` (ioredis šalje `INFO` i `CLIENT SETINFO`).

3. Učitati i potvrditi:

   ```sh
   redis-cli -a "$REDIS_ADMIN_PASSWORD" ACL LOAD
   redis-cli -a "$REDIS_ADMIN_PASSWORD" ACL GETUSER inventory-v2
   redis-cli --user inventory-v2 --pass "$REDIS_PASSWORD" PSUBSCRIBE 'inventory-v2:#/#*'
   # očekivano: "Reading messages... (press Ctrl-C to quit)" — Ctrl+C za izlaz
   ```

4. **Restartovati backend (i document-worker).** Postojeće konekcije ne
   ponavljaju `PSUBSCRIBE` nakon promjene ACL-a.

5. Potvrditi u logovima `socketio_redis_adapter_connected` sa
   `channelNamespace: "inventory-v2:"`. Ako umjesto toga piše
   `socketio_redis_acl_denied` ili `socketio_redis_adapter_fallback`, ACL i
   dalje nije ispravan. `/health/ready` vraća `socketio.mode`.

### Provjera podudarnosti prefiksa

`REDIS_KEY_PREFIX` u `.env` **mora** biti `inventory-v2` (bez dvotačke;
aplikacija sama dodaje `:`). Ako je tamo `inventory-v2-prod` a ACL ima
`&inventory-v2:*`, dobit ćete isti `NOPERM`. Prefiks u `.env`, u ACL-u i u
`document-worker` konfiguraciji moraju biti identični.

### Ako ne želite `&inventory-v2:*`

Moguće je navesti tačne kanale, ali onda treba dodati svih pet oblika iz
`buildSocketIoChannelContract()` (`backend/src/redis/socketio-channel-contract.util.ts`),
uključujući response kanal sa nasumičnim uid-om. Zato je `&inventory-v2:*`
preporučeni oblik — i dalje je strogo ograničen na namespace aplikacije.

## Šta aplikacija sada radi ako ACL ipak nije ispravan

`RedisIoAdapter.connectToRedis()` prije proglašavanja `shared_redis` režima
izvršava kratki Pub/Sub preflight na zasebnoj konekciji: `PSUBSCRIBE`, tri
`SUBSCRIBE` kanala i jedan bezopasni `PUBLISH` na kanal koji adapter ne sluša.
Ako Redis odgovori `NOPERM`, adapter:

- loguje strukturirani `socketio_redis_acl_denied` sa prefiksom, korisnikom i
  listom potrebnih kanala;
- prelazi na `in_memory` režim umjesto da pusti neuhvaćeni `ReplyError` da
  sruši proces;
- ako je `SOCKETIO_REQUIRE_SHARED_ADAPTER=true` (više replika), **namjerno**
  prekida start sa jasnom porukom.

CI to dokazuje nad pravim Redis 7 ACL-om: korak
`Verify Redis ACL channel grants for Socket.IO and BullMQ` kreira korisnika sa
kanonskim pravilom (prolaz) i korisnika sa preuskim `&…:bull*` grantom
(očekivani `NOPERM` + graceful fallback), te briše oba korisnika na kraju.
