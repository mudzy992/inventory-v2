export type SettingDependsOn = {
  key: string;
  equals?: boolean | string | number;
};

export type SettingDisplay = 'default' | 'info' | 'deprecated';

export interface SettingUiMetadata {
  dependsOn?: SettingDependsOn;
  display?: SettingDisplay;
  detail?: string;
}

export const SETTINGS_UI_METADATA: Record<string, SettingUiMetadata> = {
  'transfer.generation.on_stock_lot_issue': {
    dependsOn: { key: 'transfer.generation.enabled', equals: true },
    detail: 'Kontroliše da li izdavanje iz skladišnog lota kreira transfer i prenosnicu.',
  },
  'transfer.generation.on_zaduzenje': {
    dependsOn: { key: 'transfer.generation.enabled', equals: true },
    detail: 'Zaduženje opreme koja je već evidentirana na skladištu.',
  },
  'transfer.generation.on_prenos': {
    dependsOn: { key: 'transfer.generation.enabled', equals: true },
    detail: 'Prenos zaduženja između dvije osobe.',
  },
  'transfer.generation.on_razduzenje': {
    dependsOn: { key: 'transfer.generation.enabled', equals: true },
    detail: 'Vraćanje opreme sa radnika na skladište.',
  },
  'transfer.generation.on_rashodovanje': {
    dependsOn: { key: 'transfer.generation.enabled', equals: true },
    display: 'deprecated',
    detail:
      'Zastarjelo — novi rashod ide preko liste za rashod i komisije popisa (DisposalInventoryApproval), ne prenosnice.',
  },
  'transfer.generate_print_pdf': {
    dependsOn: { key: 'transfer.generation.enabled', equals: true },
    detail: 'Zahtijeva LibreOffice na serveru za konverziju DOCX u PDF.',
  },
  'transfer.require_signed_pdf_upload': {
    dependsOn: { key: 'transfer.generation.enabled', equals: true },
    detail: 'Bez uploadovanog potpisanog PDF-a transfer se ne može finalizirati.',
  },
  'inventory.lock_date': {
    dependsOn: { key: 'inventory.production_mode', equals: true },
    detail: 'Format MM-DD (npr. 11-30). Scheduler koristi ovaj datum za lock i opciono kreiranje draft sesije.',
  },
  'inventory.session_end_date': {
    dependsOn: { key: 'inventory.production_mode', equals: true },
    detail: 'Format MM-DD. Na ovaj datum scheduler pokušava zatvoriti aktivnu sesiju popisa.',
  },
  'inventory.auto_create_draft_session': {
    dependsOn: { key: 'inventory.production_mode', equals: true },
    detail: 'Automatski kreira POPIS {godina} po distribuciji ako ne postoji.',
  },
  'inventory.auto_close_session': {
    dependsOn: { key: 'inventory.production_mode', equals: true },
    detail: 'Zatvara aktivnu sesiju ako nema pending rashoda.',
  },
  'inventory.auto_activate_session': {
    dependsOn: { key: 'inventory.production_mode', equals: true },
    detail: 'Opcionalno aktivira draft sesiju 01.12 ako su komisije spremne.',
  },
  'inventory.scheduler_timezone': {
    dependsOn: { key: 'inventory.production_mode', equals: true },
    detail: 'IANA zona (npr. Europe/Sarajevo) za cron jobove popisa.',
  },
  'inventory.system_user_id': {
    dependsOn: { key: 'inventory.production_mode', equals: true },
    detail: 'UUID korisnika koji se koristi za sistemske akcije schedulera.',
  },
  'notifications.realtime': {
    dependsOn: { key: 'notifications.enabled', equals: true },
    detail: 'Socket.IO push za notifikacije i postavke. Isključeno = samo polling.',
  },
  'transfer.require_upload_before_sign': {
    display: 'deprecated',
    detail: 'Zastarjela postavka — koristite „Obavezan potpisani PDF”.',
  },
  'transfer.template_placeholders_help': {
    display: 'info',
    detail: 'Referentna lista placeholdera za Word šablon prenosnice po skladištu.',
  },
};

export const getSettingUiMetadata = (key: string): SettingUiMetadata | undefined =>
  SETTINGS_UI_METADATA[key];
