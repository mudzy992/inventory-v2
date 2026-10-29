export interface EmailTemplateVariableDoc {
  name: string;
  description: string;
}

export interface EmailTemplateDefinition {
  key: string;
  name: string;
  description: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  variables: EmailTemplateVariableDoc[];
}

const TRANSFER_VARIABLES: EmailTemplateVariableDoc[] = [
  { name: 'documentNumber', description: 'Broj prenosnice (npr. PR-2026-001)' },
  { name: 'equipmentName', description: 'Naziv opreme (naziv iz lota / specifikacije)' },
  { name: 'inventoryNumber', description: 'Inventurni broj opreme' },
  { name: 'serialNumber', description: 'Serijski broj opreme (ako postoji)' },
  { name: 'categoryName', description: 'Kategorija opreme' },
  { name: 'fromLabel', description: 'Ko/vlastito skladište predaje opremu' },
  { name: 'toLabel', description: 'Ko/vlastito skladište preuzima opremu' },
  { name: 'signerName', description: 'Ime i prezime potpisnika prenosnice' },
  { name: 'date', description: 'Datum prenosa' },
  { name: 'reason', description: 'Razlog prenosa (ako je upisan)' },
  { name: 'companyName', description: 'Naziv preduzeća (postavke aplikacije)' },
  { name: 'appName', description: 'Naziv aplikacije' },
];

export const DEFAULT_EMAIL_TEMPLATES: readonly EmailTemplateDefinition[] = [
  {
    key: 'transfer.completed',
    name: 'Prenos opreme izvršen',
    description:
      'Šalje se ručno iz prenosnice (panel dokumenta) uz priloženu prenosnicu kao PDF/DOCX dokument.',
    subject: 'Prenosnica {{documentNumber}} — prenos opreme izvršen',
    bodyHtml: [
      '<p>Poštovani,</p>',
      '<p>Izvršen je prenos opreme prema prenosnici <strong>{{documentNumber}}</strong> od {{date}}.</p>',
      '<table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;border-color:#d1d5db;">',
      '<tr><td><strong>Oprema</strong></td><td>{{equipmentName}}</td></tr>',
      '<tr><td><strong>Inventurni broj</strong></td><td>{{inventoryNumber}}</td></tr>',
      '<tr><td><strong>Serijski broj</strong></td><td>{{serialNumber}}</td></tr>',
      '<tr><td><strong>Kategorija</strong></td><td>{{categoryName}}</td></tr>',
      '<tr><td><strong>Predaje</strong></td><td>{{fromLabel}}</td></tr>',
      '<tr><td><strong>Preuzima</strong></td><td>{{toLabel}}</td></tr>',
      '<tr><td><strong>Potpisnik</strong></td><td>{{signerName}}</td></tr>',
      '<tr><td><strong>Razlog</strong></td><td>{{reason}}</td></tr>',
      '</table>',
      '<p>Prenosnica je priložena ovoj poruci kao dokument.</p>',
      '<p>Srdačan pozdrav,<br/>{{companyName}}<br/>{{appName}}</p>',
    ].join('\n'),
    bodyText: [
      'Poštovani,',
      '',
      'Izvršen je prenos opreme prema prenosnici {{documentNumber}} od {{date}}.',
      '',
      'Oprema: {{equipmentName}}',
      'Inventurni broj: {{inventoryNumber}}',
      'Serijski broj: {{serialNumber}}',
      'Kategorija: {{categoryName}}',
      'Predaje: {{fromLabel}}',
      'Preuzima: {{toLabel}}',
      'Potpisnik: {{signerName}}',
      'Razlog: {{reason}}',
      '',
      'Prenosnica je priložena ovoj poruci kao dokument.',
      '',
      'Srdačan pozdrav,',
      '{{companyName}}',
      '{{appName}}',
    ].join('\n'),
    variables: TRANSFER_VARIABLES,
  },
  {
    key: 'transfer.cancelled',
    name: 'Prenos opreme otkazan',
    description: 'Obavještenje da je prenosnica otkazana (spremno za buduće automatsko slanje).',
    subject: 'Prenosnica {{documentNumber}} — prenos opreme otkazan',
    bodyHtml: [
      '<p>Poštovani,</p>',
      '<p>Prenos opreme prema prenosnici <strong>{{documentNumber}}</strong> od {{date}} je <strong>otkazan</strong>.</p>',
      '<p>Oprema: {{equipmentName}} (inventurni broj {{inventoryNumber}})<br/>',
      'Predaje: {{fromLabel}}<br/>Preuzima: {{toLabel}}</p>',
      '<p>Srdačan pozdrav,<br/>{{companyName}}<br/>{{appName}}</p>',
    ].join('\n'),
    bodyText: [
      'Poštovani,',
      '',
      'Prenos opreme prema prenosnici {{documentNumber}} od {{date}} je otkazan.',
      '',
      'Oprema: {{equipmentName}} (inventurni broj {{inventoryNumber}})',
      'Predaje: {{fromLabel}}',
      'Preuzima: {{toLabel}}',
      '',
      'Srdačan pozdrav,',
      '{{companyName}}',
      '{{appName}}',
    ].join('\n'),
    variables: TRANSFER_VARIABLES,
  },
  {
    key: 'equipment.assigned',
    name: 'Oprema zadužena zaposleniku',
    description: 'Obavještenje zaposleniku da je zadužio opremu (spremno za buduće automatsko slanje).',
    subject: 'Zaduženje opreme — {{equipmentName}} ({{inventoryNumber}})',
    bodyHtml: [
      '<p>Poštovani {{toLabel}},</p>',
      '<p>Evidentirano je zaduženje opreme <strong>{{equipmentName}}</strong> (inventurni broj {{inventoryNumber}}, serijski broj {{serialNumber}}) dana {{date}}.</p>',
      '<p>Prenosnica <strong>{{documentNumber}}</strong> je dostupna kod osobe koja je izvršila prenos.</p>',
      '<p>Srdačan pozdrav,<br/>{{companyName}}<br/>{{appName}}</p>',
    ].join('\n'),
    bodyText: [
      'Poštovani {{toLabel}},',
      '',
      'Evidentirano je zaduženje opreme {{equipmentName}} (inventurni broj {{inventoryNumber}}, serijski broj {{serialNumber}}) dana {{date}}.',
      'Prenosnica {{documentNumber}} je dostupna kod osobe koja je izvršila prenos.',
      '',
      'Srdačan pozdrav,',
      '{{companyName}}',
      '{{appName}}',
    ].join('\n'),
    variables: TRANSFER_VARIABLES,
  },
  {
    key: 'system.test',
    name: 'Testna poruka',
    description: 'Šalje se iz SMTP postavki dugmetom „Pošalji testni email" za provjeru konfiguracije.',
    subject: '[{{appName}}] Testna poruka — SMTP konfiguracija radi',
    bodyHtml: [
      '<p>Poštovani,</p>',
      '<p>Ovo je testna poruka poslana iz aplikacije <strong>{{appName}}</strong>.</p>',
      '<p>Ako ste primili ovu poruku, SMTP konfiguracija ({{smtpProvider}}) je ispravna i slanje emaila radi.</p>',
      '<p>Srdačan pozdrav,<br/>{{companyName}}<br/>{{appName}}</p>',
    ].join('\n'),
    bodyText: [
      'Poštovani,',
      '',
      'Ovo je testna poruka poslana iz aplikacije {{appName}}.',
      'Ako ste primili ovu poruku, SMTP konfiguracija ({{smtpProvider}}) je ispravna i slanje emaila radi.',
      '',
      'Srdačan pozdrav,',
      '{{companyName}}',
      '{{appName}}',
    ].join('\n'),
    variables: [
      { name: 'appName', description: 'Naziv aplikacije' },
      { name: 'companyName', description: 'Naziv preduzeća (postavke aplikacije)' },
      { name: 'smtpProvider', description: 'Odabrani SMTP provajder (gmail / office365 / custom)' },
      { name: 'testRecipient', description: 'Adresa na koju je test poslan' },
    ],
  },
] as const;

export const getDefaultEmailTemplate = (key: string): EmailTemplateDefinition | undefined =>
  DEFAULT_EMAIL_TEMPLATES.find((template) => template.key === key);

/** Primjer vrijednosti za admin pregled template-a (bez pravih podataka). */
export const SAMPLE_TEMPLATE_VARIABLES: Record<string, string> = {
  documentNumber: 'PR-2026-001',
  equipmentName: 'Laptop Dell Latitude 5540',
  inventoryNumber: 'INV-000123',
  serialNumber: 'SN-ABC-12345',
  categoryName: 'Računari i oprema',
  fromLabel: 'Marko Marković (Centralno skladište)',
  toLabel: 'Ana Anić',
  signerName: 'Petar Petrović',
  date: '29.10.2026.',
  reason: 'Zaduženje za rad od kuće',
  companyName: 'Primjer d.o.o.',
  appName: 'Evidens',
  smtpProvider: 'gmail',
  testRecipient: 'test@firma.ba',
};
