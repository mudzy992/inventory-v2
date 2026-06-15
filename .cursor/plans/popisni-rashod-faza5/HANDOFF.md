# HANDOFF — Popisni rashod Faza 5 (produkcijska automatizacija)

**Datum:** 2026-06-15  
**Prethodni plan:** [popisni_rashod_workflow_fdca4f4e.plan.md](../popisni_rashod_workflow_fdca4f4e.plan.md) (Faze 1–4)  
**Detaljni plan Faze 5:** [00_plan-faza5.md](./00_plan-faza5.md)  
**Matrice:** [inventory-count](../../docs/matrices/inventory-count/MATRIX.md) · [disposal-commission](../../docs/matrices/disposal-commission/MATRIX.md) · [equipment-status](../../docs/matrices/equipment-status/MATRIX.md)  
**Status Faza 1–4:** Implementirano u kodu; migracija `20260615120000_equipment_disposal_list` — provjeriti `prisma migrate deploy` na okruženju.

---

## Za novu sesiju (copy-paste)

```
Nastavi iz:
1. .cursor/plans/popisni-rashod-faza5/HANDOFF.md
2. .cursor/plans/popisni-rashod-faza5/00_plan-faza5.md

Cilj sesije: implementirati Fazu 5 — produkcijska automatizacija popisa i rashoda
(scheduler, production_mode, popis_koordinator, kalendar 31.11–31.12).

Prije koda:
- Pročitaj 00_plan-faza5.md sekciju "Odluke prije implementacije"
- Potvrdi s ownerom kalendar (31.11 lock vs 01.12 activate) ako nije već dogovoreno

Dev:
cd backend && npx prisma migrate deploy && npm run dev
cd frontend && npm run dev
```

---

## Šta je urađeno (Faze 1–4) — kontekst za Fazu 5

### Backend

| Komponenta | Fajl / model | Ponašanje |
|------------|--------------|-----------|
| Lista za rashod | `EquipmentDisposalListItem`, migracija `20260615120000_*` | Evidentičar označava u **draft** sesiji; auto razduženje |
| API liste | `equipment-disposal-list.service.ts`, controller rute `.../disposal-list` | GET/POST/DELETE |
| Dodjela komisiji | hook u `createCommittee` → `assign-disposal-list-to-commission.util.ts` | `listed` → `DisposalInventoryApproval` pending |
| Aktivacija guard | `activateSession` | Blok ako ostaju `listed` stavke bez komisije |
| Odluka rashoda | `reviewDisposalApproval` | Approve → `rashodovano` + `unisteno` |
| Reaktivacija | `POST /equipment/:id/reactivate` | Admin + obrazloženje + `EquipmentEvent.reaktivirano` |
| Legacy | `disposal-commissions.create` blokiran; novi transfer `rashodovanje` blokiran | Rashod samo kroz popis |
| Postavka | `features.disposal_pre_list` | Registry + gate |

### Frontend

| UI | Fajl |
|----|------|
| Označi za rashod | `equipment-mark-disposal-dialog.tsx`, `EquipmentCard.tsx` |
| Lista u popisu | `disposal-list-panel.tsx` → tab Rashod (draft/active) |
| Inbox/izvještaj | `session-disposal-tab.tsx` (closing/closed) |
| Komisije rashoda | `DisposalCommissionsPage.tsx` — read-only |

### Šta Faza 5 **ne mora** ponovo raditi

- Model `EquipmentDisposalListItem`, inbox rashoda, close job, freeze po gradu za transfere (djelimično)
- Auto `DisposalCommission` uz `InventoryCommittee`

---

## Donesene odluke (iz Faza 1–4 + razgovor s ownerom)

1. **Zadužena oprema na listi** → auto razduženje (prenosnica ako `transfer.generation.on_razduzenje`).
2. **Konačno stanje rashoda** → komisija postavlja `unisteno` (bez koraka skladištara u novom toku).
3. **Komisija rashoda** → isključivo uz popisnu komisiju (nema standalone create).
4. **Admin** → povrat s liste samo u `draft`; reaktivacija nakon službenog otpisa.
5. **Produkcija (Faza 5 — namjera ownera):**
   - Na **31.11.** (konfigurabilno) zaključati skladišta / normalne operacije u tekućoj godini.
   - Auto-kreirati sesiju `POPIS {year}` po distribuciji.
   - Administrator (ili nova uloga) definiše komisije po skladištima.
   - Popis + rashod traju do **31.12.**; nakon toga otključavanje.
   - Nova godina = nova sesija; stavke liste se **ne prenose**.
   - Razdužena oprema „mapira“ na novu tekuću godinu (operativno — ostaje aktivna, nije na listi rashoda).

---

## Gapovi koji Faza 5 mora adresirati

| # | Gap | Trenutno | Cilj Faze 5 |
|---|-----|----------|-------------|
| G1 | Scheduled activate/close | Samo ručno (`PATCH activate/close`) | Cron ili ekvivalent po kalendaru |
| G2 | Auto-kreiranje sesije | Admin ručno `POST /inventory-sessions` | Job na 31.11 (ili dan prije) |
| G3 | Freeze skladišta (prijem/izdavanje lotova) | Djelimično (`InventoryFreezeService` na transfer/equipment) | Eksplicitna blokada u production_mode |
| G4 | Freeze evidentičara | Admin bypass; ostalo ograničeno | Jasna pravila u production periodu |
| G5 | Uloga za komisije bez punog admina | Samo `admin` kreira komisije | `popis_koordinator` (ili sl.) |
| G6 | Više distribucija | UI: `resolveRootDistributionOrgUnit` — jedna krovna | Auto sesija **po svakoj** distribuciji? |
| G7 | Auto-zatvaranje | Close zahtijeva admin + disposal inbox prazan? | Politika 31.12 (force vs soft) |
| G8 | `@nestjs/schedule` | **Ne postoji** u repou | Dodati ili HTTP cron endpoint |

---

## Otvorena pitanja (riješiti na početku Faze 5)

| ID | Pitanje | Preporuka (default) |
|----|---------|---------------------|
| Q1 | Tačan datum lock-a: 30.11. ili 31.11. u 23:59? | Postavka `inventory.lock_day_month` = `11-30` (bez godine) |
| Q2 | Auto **aktivacija** 01.12. ili ručna nakon što koordinator završi komisije? | **Ručna** activate dok nisu sve komisije + nema `listed` bez komisije; optional auto-activate 01.12 ako `committees.length > 0` |
| Q3 | Auto **close** 31.12. ako inbox rashoda ima pending? | **Ne** force-close; notifikacija adminu + status `closing` blokiran dok pending > 0 |
| Q4 | Jedna ili više distribucija? | Job iterira sve `OrgUnit.type = distribucija` |
| Q5 | Ime uloge: `popis_koordinator` vs proširenje `evidenticar`? | Nova enum vrijednost `popis_koordinator` (čistiji RBAC) |
| Q6 | Scheduler: u procesu Nest (`@nestjs/schedule`) vs OS cron → admin endpoint? | `@nestjs/schedule` + env `INVENTORY_SCHEDULER_ENABLED` |
| Q7 | „Razdužena mapira na novu godinu“ — treba li DB polje `inventoryYear` na opremi? | **Ne** u prvoj iteraciji — dovoljno da nije na listi rashoda i sesija je `closed` |

---

## Rizici

- **Zatvaranje s pending rashodom** — automatsko zatvaranje može ostaviti opremu u nekonzistentnom stanju.
- **Multi-distribucija** — frontend danas pretpostavlja jednu krovnu distribuciju; Faza 5 može zahtijevati UI za više sesija.
- **Timezone** — cron mora koristiti `Europe/Sarajevo` (ili env) za 31.11/31.12.
- **Dupla sesija** — unique `(orgUnitId, year)` već postoji; job mora biti idempotentan.
- **Migracija** — bez `equipment_disposal_list` tabele Faza 1–4 ne radi.

---

## Test status (Faza 1–4)

| Test | Status |
|------|--------|
| `npm run build` backend | ✅ |
| `npm run build` frontend | ✅ |
| Unit testovi (`assign-disposal-list`, `resolve-parent-asset-category`) | Dodani; `npm test` **nije** u backend `package.json` |
| E2E ručni | Nije dokumentiran u ovoj sesiji |
| `prisma migrate deploy` | Ručno kreirana migracija; originalni `migrate dev` prekinut (exit 130) |

---

## Next steps (redoslijed za sljedeću sesiju)

1. Owner potvrdi Q1–Q7 (ili prihvati preporuke u [00_plan-faza5.md](./00_plan-faza5.md)).
2. Implementirati **5.1 Postavke** (registry + matrica settings).
3. Implementirati **5.2 Scheduler modul** (idempotentni jobovi).
4. Implementirati **5.3 Auto draft sesija** (31.11).
5. Implementirati **5.4 Production freeze** (proširiti `InventoryFreezeService` + warehouse-stock).
6. Implementirati **5.5 Uloga `popis_koordinator`** (Prisma enum + guards + UI).
7. Implementirati **5.6 Auto-close workflow** (31.12 + notifikacije).
8. Ažurirati matrice + CHANGELOG; ručni E2E checklist.

Detaljni breakdown: **[00_plan-faza5.md](./00_plan-faza5.md)**.

---

## Ključni fajlovi za Fazu 5 (touch map)

| Oblast | Postojeći fajl |
|--------|----------------|
| Sesija lifecycle | `backend/src/modules/inventory-count/inventory-count.service.ts` |
| Freeze | `backend/src/common/services/inventory-freeze.service.ts` |
| Warehouse stock | `backend/src/modules/warehouse-stock/warehouse-stock.service.ts` |
| Settings | `backend/src/modules/settings/settings.registry.ts` |
| Roles | `backend/prisma/schema.prisma` (`UserRole`), guards, JWT |
| Admin popis UI | `frontend/src/components/InventoryCountPage.tsx` |
| Nav / RBAC | `frontend/src/routes/app-routes.ts`, layout nav gate |
| Dokumentacija | `.cursor/docs/full-effect.md` §11.3 (scheduled stub) |
