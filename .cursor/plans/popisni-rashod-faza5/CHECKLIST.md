# CHECKLIST — Faza 5 produkcijska automatizacija

## Priprema
- [ ] Owner potvrdio Q1–Q7 iz HANDOFF.md (ili prihvaćeni defaulti u 00_plan-faza5.md)
- [ ] Migracija `20260615120000_equipment_disposal_list` deployana na ciljnom okruženju

## 5.1 Postavke
- [ ] Registry ključevi `inventory.*`
- [ ] `InventoryProductionModeService`
- [ ] Matrica settings + CHANGELOG

## 5.2 Scheduler
- [ ] `@nestjs/schedule` instaliran i registriran
- [ ] `inventory-scheduler` modul
- [ ] Idempotentni jobovi (lock day, end day, rollover)
- [ ] Env `INVENTORY_SCHEDULER_ENABLED`

## 5.3 Auto draft sesija
- [ ] `ensureDraftSessionForDistribution`
- [ ] Notifikacija adminu

## 5.4 Production freeze
- [ ] Blokada warehouse-stock u lock periodu
- [ ] Proširen freeze-banner API + UI

## 5.5 popis_koordinator
- [ ] Prisma enum + migracija
- [ ] `InventoryCoordinatorAssignment` (ili ekvivalent)
- [ ] Scope service + guards
- [ ] User admin UI dodjele
- [ ] InventoryCountPage za koordinatora

## 5.6 Auto-close
- [ ] End day job + pending rashod guard
- [ ] System user za close job
- [ ] Notifikacije

## 5.7 Dokumentacija i testovi
- [ ] Matrice: inventory-count, roles-access, disposal-commission
- [ ] Unit testovi production mode + ensure draft
- [ ] E2E checklist iz 00_plan-faza5.md
