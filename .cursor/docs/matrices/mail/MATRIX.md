# Matrica: E-pošta (SMTP)

## SMTP konfiguracija

- Backend modul `backend/src/modules/mail/` — nodemailer transport, singleton red `mail_configurations` (id `default`)
- Provajderi: **gmail** (smtp.gmail.com:587 STARTTLS, App Password), **office365** (smtp.office365.com:587 STARTTLS, SMTP AUTH), **custom** (host/port/secure ručno); za gmail/office365 server zaključava host/port/secure na preset (klijentske vrijednosti se ignorišu — `resolveSmtpConnectionFields`)
- Lozinka: AES-256-GCM u mirovanju (`mail-secret.util`), ključ iz `MAIL_CONFIG_SECRET` (fallback derivacija iz `JWT_SECRET`); API nikada ne vraća lozinku, samo `hasPassword`; prazno polje pri čuvanju = zadrži postojeću
- Admin UI: `Postavke → E-pošta (SMTP)` (`/settings/email`) — kartice provajdera s predefinisanim formama po odabiru, „Testiraj vezu" (`transporter.verify()`), „Pošalji testni email" (template `system.test`)
- Uključivanje slanja (`enabled`) validira host/korisničko ime/from adresu/lozinku

## Email template-i

- Tabela `email_templates` (key unique); zadani se siju idempotentno pri startu (`ensureSeeded`), postojeći uređeni se ne prepisuju; reset vraća zadanu verziju iz `email-template.defaults.ts`
- Zadani: `transfer.completed` (prenos izvršen — glavni, prenosnica u prilogu), `transfer.cancelled`, `equipment.assigned`, `system.test`
- Sintaksa `{{variable}}`; render: HTML escape u HTML tijelu, plain u subject/text; nepoznate varijable ostaju vidljive u pregledu; pregled koristi ogledne podatke (`SAMPLE_TEMPLATE_VARIABLES`)
- Admin editor: naziv/opis/subject/HTML/tekst, uključi/isključi, klik na varijablu ubacuje token, pregled (iframe + tekst), reset
- Isključen template blokira slanje s jasnom greškom

## Slanje prenosnice (glavni tok)

- `POST /mail/transfers/:id/send` { to, cc, bcc } (stringovi sa zarezima; validacija i deduplikacija adresa) — role admin/evidenticar/moderator, scope provjera preko `TransfersService.findOne` (ista kao preuzimanje dokumenta)
- UI: sekcija „Pošalji prenosnicu e-poštom" u `TransferDocumentPanel` (Za/Cc/Bcc polja), ne prikazuje se u inventory modu ni za otkazane prenosnice
- Prilog: generisani **PDF** prenosnice; ako PDF konverzija još traje, **DOCX** obrazac (email ne čeka LibreOffice worker); ako dokument još ne postoji — jasna greška
- Varijable template-a iz stvarnog transfera: broj prenosnice, oprema (productName iz lota), inventurni/serijski broj, kategorija, predaje/preuzima (isti labeli kao Word obrazac), potpisnik, datum, razlog + `app.name`/`company.name` iz postavki
- Svako slanje (uspješno i neuspješno) upisuje `email_logs` red (primaoci, naslov, template, status, greška); admin dnevnik na SMTP stranici

## Gdje

| Mjesto | Ko može |
|--------|---------|
| `/settings/email` (konfiguracija, template-i, dnevnik) | admin |
| `TransferDocumentPanel` — slanje prenosnice | admin, evidenticar, moderator (u svom scope-u) |
