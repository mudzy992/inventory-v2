# Redis ACL — `inventory-v2` korisnik i Pub/Sub kanali

Ovaj dokument je operativni odgovor na grešku:

```
BullMQ: WARNING! Your redis options maxRetriesPerRequest must be null and will be overridden by BullMQ.
ReplyError: NOPERM No permissions to access a channel
    command: { name: 'psubscribe', args: [ 'inventory-v2:#/#*' ] }
```

## Šta se desilo — i zašto `&inventory-v2:*` nije dovoljan

`RedisIoAdapter` (`backend/src/redis/redis-io.adapter.ts`) namjerno postavlja
`createAdapter(pubClient, subClient, { key: config.keyPrefix })`. Time se svi
Socket.IO Pub/Sub kanali sele u `${REDIS_KEY_PREFIX}:*` namespace. Adapter
pravi jedan `PSUBSCRIBE` pattern **po Socket.IO namespaceu**; aplikacija ima
root (`/`) i `notifications`:

```
PSUBSCRIBE inventory-v2:#/#*
PSUBSCRIBE inventory-v2:#/notifications#*
SUBSCRIBE  inventory-v2:-request#/# , inventory-v2:-response#/#… ,
           inventory-v2:-request#/notifications# , inventory-v2:-response#/notifications#…
PUBLISH    inventory-v2:#/#… , inventory-v2:#/notifications#…
```

Redis ACL ima dvije nezavisne ose: `~<prefix>:*` dozvoljava ključeve,
`&<pattern>` dozvoljava Pub/Sub kanale. Od Redis 7 novi ACL user starta sa
`resetchannels`, pa korisnik koji ima samo `~inventory-v2:*` ne smije ništa od
Pub/Sub-a. Ali postoji **druga, manje poznata zamka** zbog koje ni
`&inventory-v2:*` ne rješava problem. U `src/acl.c` (`ACLCheckChannelAgainstList`):

> *„the pattern provided in PSUBSCRIBE can only be matched as a literal
> against an ACL pattern (using plain string compare)"*
> `if ((is_pattern && !strcmp(pattern,channel)) || …)`

Dakle: za `PUBLISH` i `SUBSCRIBE` ACL patterni rade kao globovi, ali za
`PSUBSCRIBE` klijentov pattern mora biti **doslovno jednak** jednom od `&`
unosa. Jedan `&inventory-v2:*` ne pokriva `inventory-v2:#/#*`, pa Redis vraća
`NOPERM No permissions to access a channel`. Biblioteka poziva `psubscribe()`
bez callbacka, pa odbijeni ioredis promise završava kao neuhvaćena greška i
ruši proces. Jedini izuzetak je `+allchannels` (ili `&*`), ali to ukida
izolaciju kanala između deploymenta na zajedničkom Redisu.

`BullMQ: WARNING! Your redis options maxRetriesPerRequest must be null…` je
druga, odvojena (kozmetička) greška: BullMQ interno forsira `null`, a mi smo mu
slali `3`. Ispravljeno je kroz `buildBullMqRedisOptions()` u backendu i
document-workeru; opšti Redis klijent i Socket.IO adapter i dalje koriste `3`.

## Šta uraditi na Redis platformi

1. Provjeriti stvarno stanje korisnika (ne ono što piše u fajlu):

   ```sh
   redis-cli -a "$REDIS_ADMIN_PASSWORD" ACL GETUSER inventory-v2
   ```

   Obratiti pažnju na red `channels` — mora sadržavati **sve** donje unose.

2. Ažurirati `acl/users.acl` po šablonu
   [`deploy/redis/users.acl.example`](../deploy/redis/users.acl.example):

   ```sh
   # <PREFIX> = REDIS_KEY_PREFIX bez dvotačke, npr. inventory-v2
   user inventory-v2 on ><JAKA_LOZINKA> \
     ~inventory-v2:* \
     &inventory-v2:* \
     &inventory-v2:#/#* \
     &inventory-v2:#/notifications#* \
     +@all -@admin -@dangerous +info
   ```

   Alternativno, bez restarta config fajla:

   ```sh
   redis-cli -a "$REDIS_ADMIN_PASSWORD" \
     ACL SETUSER inventory-v2 on resetkeys resetchannels \
     '~inventory-v2:*' '&inventory-v2:*' \
     '&inventory-v2:#/#*' '&inventory-v2:#/notifications#*' \
     +@all -@admin -@dangerous +info
   ```

   Napomene:
   - Navodnici oko `&…` i `~…` su obavezni u shellu (`&` pokreće proces u
     pozadini). U `users.acl` fajlu navodnici nisu potrebni.
   - **Svaki novi `@WebSocketGateway({ namespace: '…' })` zahtijeva novi
     `&<prefix>:#/<namespace>#*` unos.** CI statički poredi deklarisane
     namespace-e sa `SOCKETIO_NAMESPACES` u
     `backend/src/redis/socketio-channel-contract.util.ts`.
   - `+info` vraća `INFO` koji `-@dangerous` inače oduzima; bez njega ioredis
     na svakoj konekciji loguje „Skipping the ready check". `-@dangerous` ne
     uklanja `EVAL`/`EVALSHA` (oni su u `@scripting`), koje BullMQ koristi.
   - Ako platforma koristi užu allowlistu kategorija, obavezno zadržati
     `@pubsub`, `@scripting`, `@blocking`, `@stream`, `@list`, `@sortedset`,
     `@hash`, `@set`, `@string`, `@keyspace`, `@read`, `@write`, `@slow` i
     `@connection`, plus `+info`.

3. Učitati i potvrditi:

   ```sh
   redis-cli -a "$REDIS_ADMIN_PASSWORD" ACL LOAD
   redis-cli -a "$REDIS_ADMIN_PASSWORD" ACL GETUSER inventory-v2
   redis-cli --user inventory-v2 --pass "$REDIS_PASSWORD" \
     PSUBSCRIBE 'inventory-v2:#/#*' 'inventory-v2:#/notifications#*'
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

## Šta aplikacija sada radi ako ACL ipak nije ispravan

`RedisIoAdapter.connectToRedis()` prije proglašavanja `shared_redis` režima
izvršava kratki Pub/Sub preflight na zasebnoj konekciji: `PSUBSCRIBE` svih
patterna za oba namespacea, `SUBSCRIBE` svih request/response kanala i jedan
bezopasni `PUBLISH` na kanal koji adapter ne sluša. Ako Redis odgovori
`NOPERM`, adapter:

- loguje strukturirani `socketio_redis_acl_denied` sa prefiksom, korisnikom i
  potrebnim `&` grantovima;
- prelazi na `in_memory` režim umjesto da pusti neuhvaćeni `ReplyError` da
  sruši proces;
- ako je `SOCKETIO_REQUIRE_SHARED_ADAPTER=true` (više replika), **namjerno**
  prekida start sa jasnom porukom.

CI dokazuje oba slučaja:

- `Verify Socket.IO ACL denial degrades instead of crashing`
  (`check-socketio-acl-denial.ts`) — RESP stub vraća pravi `-NOPERM` bez
  Redis binaryja;
- `Verify Redis ACL channel grants for Socket.IO and BullMQ`
  (`check-redis-acl-channels.ts`) — pravi Redis 7 ACL sa **tri** testna usera:
  kanonsko pravilo (prolaz, stvarna Pub/Sub dostava), glob-only
  `&inventory-v2:*` (očekivani `NOPERM` — dokaz literalnog poređenja) i
  preuski `&inventory-v2:bull*` (očekivani `NOPERM`). Svi se brišu na kraju.
