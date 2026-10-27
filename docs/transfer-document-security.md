# Sigurnost generiranog HTML dokumenta prenosnice

**Endpoint:** `GET /transfers/:id/raw-document` (admin / evidentičar / moderator).
Vraća `text/html` generiran iz poslovnih podataka (broj dokumenta, status,
razlog, napomena, imena osoba, inventurni broj). To je bila posljednja P1
površina za **stored XSS**: ako se ruta servira pod istim originom kao
aplikacija, ubačeni markup bi se izvršio u browseru korisnika koji otvori
dokument.

Implementacija: `transfer-raw-document.util.ts` (escaping),
`transfer-document-security.util.ts` (provjera + headeri),
`transfers.controller.ts` (spajanje).

## Slojevi zaštite

1. **escaping (primarni).** `escapeHtmlText()` zamjenjuje `& < > " '` u svim
   dinamičkim čvorovima. Regression testovi koriste `</td><script>…`, `&` i
   atributne payload-e. Ništa od poslovnih podataka ne ulazi u HTML kao markup.
2. **Tag allow-list (runtime asercija).** `assertSafeTransferDocument(html)`
   prije slanja provjerava da dokument ima HTML5 doctype, da sadrži samo
   dozvoljene tagove (`html/head/meta/title/style/body/h1/p/strong/table/tr/th/td/br`),
   da nijedan tag nema `on*` handler ni `javascript:` / `data:text/html` url, i
   da inline `<style>` blok ne sadrži sirovi `<`. Bilo koje kršenje baca grešku
   (fail-closed 500) umjesto da se dokument pošalje.
3. **Hash-based CSP.** `buildTransferDocumentCsp(html)` računa SHA-256 **iz
   stvarnog** `<style>` bloka u svakom odgovoru — ne koristi hard-kodirani hash
   koji bi zastario kad se stil promijeni. Politika:
   `default-src 'none'; style-src 'sha256-…'; script-src 'none'; img-src 'none';
   font-src 'none'; connect-src 'none'; media-src 'none'; object-src 'none';
   base-uri 'none'; form-action 'none'; frame-ancestors 'none'; sandbox`.
   `sandbox` bez tokena daje dokumentu opaque origin i onemogućuje skripte,
   forme i popup-e.
4. **attachment (default).** `Content-Disposition: attachment;
   filename="prenosnica-<broj>.html"` — dokument se preuzima, ne renderuje se
   u originu API-ja. Ime fajla se izvodi iz `<title>` i sanitizuje na
   `[A-Za-z0-9._-]` (bez CRLF, navodnika, `..` i path separatora), pa nema
   header injection-a.
5. **Ostali headeri:** `X-Content-Type-Options: nosniff`,
   `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`,
   `Cache-Control: no-store` (poslovni podaci se ne keširaju).

## Reverzibilnost (odluka vlasnika)

`TRANSFER_RAW_DOCUMENT_DISPOSITION` prihvata `attachment` (default) ili
`inline`. `inline` zadržava **sve** ostale kontrole — escaping, tag allow-list,
hash-CSP, sandbox, no-store — ali dozvoljava prikaz u browseru (npr. za
print workflow). Bilo koja druga vrijednost ruši zahtjev (strogo parsiranje).
Varijabla je u `.env.example`, oba compose fajla i u deployment readiness
provjeri (`transfer-raw-disposition` upozorava na `inline`).

Globalni HTTP hardening i dalje **ne** postavlja CSP za cijelu aplikaciju —
ovdje se CSP računa tačno za ovaj dokument, pa nema rizika da se slomi neka
druga ruta.

## Ograničenje

Kada se preuzeti `.html` fajl otvori sa diska, response headeri (pa ni CSP)
više nisu prisutni. Zato je **escaping i dalje primarni kontrolni mehanizam**,
a CSP/sandbox su drugi sloj za slučaj da dokument ipak bude renderovan inline
(proxy koji ignorira `Content-Disposition`, `inline` režim, buduća izmjena).
Otvoreni lokalni fajl nema pristup originu aplikacije.

## Dokazi

- 10 unit scenarija: allow-list za stvarni dokument, inertni XSS payloadi,
  CSP iz stvarnog style hash-a (i promjena hasha pri izmjeni stila), više
  `<style>` blokova, 9 varijanti neispravnog markup-a, komplet header set,
  `inline` režim, header-injection kroz broj dokumenta, sanitizacija imena i
  strogo parsiranje disposition-a.
- `backend/prisma/check-transfer-document-security.ts`: statički gate nad
  kontrolerom, builder-om, env-om, compose-om, readiness alatom i ovim
  vodičem; runtime dokaz sa hostilnim payload-om; **5 mutacija** (ubаčen
  `<script>`, uklonjen style blok, izmijenjen stil, `inline` režim, CRLF u
  broju dokumenta) — sve odbijene ili dokazano bezbjedne.
- CI korak: `Verify generated HTML document security`.
