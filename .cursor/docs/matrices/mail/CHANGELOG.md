# Changelog: mail

## 2026-10-29

- Novi SMTP modul (`backend/src/modules/mail/`): konfiguracija Gmail / Microsoft 365 / custom s predefinisanim formama po provajderu (preset zaključava host/port/enkripciju), lozinka šifrovana AES-256-GCM u bazi, test veze i testni email iz admin postavki (`/settings/email`).
- Email template-i u bazi (`email_templates`) s editorom, pregledom na oglednim podacima i resetom na zadano: `transfer.completed`, `transfer.cancelled`, `equipment.assigned`, `system.test`.
- Slanje prenosnice emailom iz `TransferDocumentPanel`: polja Za/Cc/Bcc, obavještenje template-om `transfer.completed`, prenosnica kao prilog (PDF, fallback DOCX dok konverzija traje); svako slanje se evidentira u `email_logs`.
- Migracija `20261029120000_add_mail_module` (tabele `mail_configurations`, `email_templates`, `email_logs`).
