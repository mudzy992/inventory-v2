-- Production hardening: sprečava TOCTOU race koji bi dozvolio DVA
-- istovremena "aktivna" (queued/running) DocumentJob reda za isti
-- (sourceType, sourceId) par — npr. dva paralelna HTTP zahtjeva koja oba
-- pozovu enqueuePdfConversion prije nego prvi red uopšte bude vidljiv
-- drugom (check-then-insert race). Bez ovoga, moguće su DVIJE paralelne
-- LibreOffice konverzije za istu prenosnicu koje pišu na isti
-- resultRelativePath.
--
-- Partial unique index nije izraziv u schema.prisma DSL-u (Prisma nema
-- WHERE klauzulu za @@unique/@@index) — postoji SAMO ovdje, u migraciji.
-- `prisma migrate deploy` ga primjenjuje normalno; ne diramo ga kroz
-- schema.prisma da ne bismo izazvali "drift" upozorenje pri budućem
-- `prisma migrate dev`. Vidi DocumentJobsService.create() i
-- DocumentConversionQueueService.enqueuePdfConversion() za rukovanje P2002
-- (unique violation) greškom koju ovaj indeks proizvodi.
CREATE UNIQUE INDEX "document_jobs_active_source_unique"
  ON "document_jobs" ("sourceType", "sourceId")
  WHERE "status" IN ('queued', 'running');
