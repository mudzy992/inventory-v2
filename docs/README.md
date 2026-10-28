# Dokumentacija — Evidens (Inventory v2)

**Počni ovdje.** Statusi: [STATUS.md](./STATUS.md) (šta je završeno) ·
[BACKLOG.md](./BACKLOG.md) (šta je ostalo). Ovaj fajl je tematski indeks;
fajlovi se ne premještaju jer CI gate `Verify deployment readiness contract`
zahtijeva operativne vodiče na ovim putanjama.

## Mapa repoa

```
inventory-v2/
├── backend/           NestJS 11 + Prisma 7 + PostgreSQL (24 modula, 164 spec fajla)
├── frontend/          React + Vite + Tailwind (stranice po ulogama, Evidens Surface)
├── document-worker/   Document Engine — LibreOffice DOCX/XLSX/ODT → PDF (BullMQ, interno)
├── docs/              ova dokumentacija (operativa + auditi + moduli A/B)
├── deploy/redis/      kanonski Redis ACL template
├── scripts/           readiness / load-test / container-policy alati (bez zavisnosti)
├── .cursor/docs/      matrice (22 modula) + dizajn tokeni + Full Effect specifikacija
├── .cursor/plans/     historijski planovi sesija — katalog: .cursor/plans/INDEX.md
├── docker-compose.yml        Coolify (kanonski produkcijski put)
├── docker-compose.prod.yml   standalone Traefik (alternativni put)
├── .env.example       jedini env template u repou (bez tajni)
└── CHANGES.md         changelog Redis/Socket.IO isporuke
```

## Tematski raspored

### 1. Status i planiranje
- [STATUS.md](./STATUS.md) — jedinstveni registar završeno/nije po modulima i programima.
- [BACKLOG.md](./BACKLOG.md) — preostala implementacija (P0–P3).
- [../.cursor/plans/inventory-v2/CHECKLIST.md](../.cursor/plans/inventory-v2/CHECKLIST.md) — faze 0–12.
- [../.cursor/plans/full-effect/CHECKLIST.md](../.cursor/plans/full-effect/CHECKLIST.md) — faze 13–18c (49/50).

### 2. Poslovna pravila
- [module-a-business-matrix.md](./module-a-business-matrix.md) — Modul A (BM-1..BM-6) ✅ implementiran.
- [module-b-print-qr.md](./module-b-print-qr.md) — Modul B (print/QR) ✅ implementiran.
- [../.cursor/docs/matrices/INDEX.md](../.cursor/docs/matrices/INDEX.md) — 22 matrice + [GUARDS_REGISTRY](../.cursor/docs/matrices/GUARDS_REGISTRY.md).
- [frontend-design-system.md](./frontend-design-system.md) — Evidens Surface (29 tokena, WCAG AA).

### 3. Operativa i sigurnost (operator vodiči)
- [deployment-readiness.md](./deployment-readiness.md) — jedna PASS/WARN/FAIL provjera prije deploya (23 knoba).
- [coolify-env.md](./coolify-env.md) — Coolify env varijable (bez tajni).
- [redis-acl.md](./redis-acl.md) — Redis 7 ACL + Socket.IO kanali.
- [http-hardening.md](./http-hardening.md) — headeri, HSTS, rate limit, trust proxy.
- [public-qr-privacy.md](./public-qr-privacy.md) — zamrznuti javni QR DTO ugovor.
- [upload-read-policy.md](./upload-read-policy.md) · [transfer-document-security.md](./transfer-document-security.md)
- [queue-recovery.md](./queue-recovery.md) — BullMQ/DocumentJob oporavak i outbox.
- [performance-budgets.md](./performance-budgets.md) · [load-testing.md](./load-testing.md)

### 4. Auditi (nezavisni, code-only)
- [backend-code-audit-2026-10-27.md](./backend-code-audit-2026-10-27.md) — ocjena ~9.5/10 (N-nalazi zatvoreni).
- [frontend-code-audit-2026-10-28.md](./frontend-code-audit-2026-10-28.md) — ocjena ~9.2/10 (F-nalazi zatvoreni).

### 5. Historijski snapshoti 🗄 (ne ažurirati — slika starog baseline-a)
- [backend-audit.md](./backend-audit.md) · [frontend-audit.md](./frontend-audit.md)
- [backend-implementation-plan.md](./backend-implementation-plan.md) · [frontend-implementation-plan.md](./frontend-implementation-plan.md)
- [migration-mysql-postgres.md](./migration-mysql-postgres.md) — kako je rađen prelaz MySQL → PostgreSQL (rollback referenca).

## Pravila održavanja

1. Nova poslovna logika ⇒ ažurirati `MATRIX.md` + `CHANGELOG.md` matrice + red u `GUARDS_REGISTRY.md`.
2. Nova isporuka ⇒ status u [STATUS.md](./STATUS.md), ostatak u [BACKLOG.md](./BACKLOG.md).
3. Planovi u `.cursor/plans/` se ne prepisuju retroaktivno — služe kao trag sesija.
4. Tajne nikad u repo (ni u `.md` ni u `.txt`): samo `.env.example` placeholderi + Coolify env.
