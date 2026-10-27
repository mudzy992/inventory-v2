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
  'transfer.generation.enabled': {
    detail:
      'Samo generisanje prenosnica. Isključeno: prenosi opreme i dalje rade bez dokumenata. Za potpuni blok prenosa isključite modul „Zaduženja i prenosi”.',
  },
  'transfer.generation.on_stock_lot_issue': {
    dependsOn: { key: 'transfer.generation.enabled', equals: true },
    detail: 'Isključeno: direktno zaduženje iz lota bez transfer zapisa i prenosnice.',
  },
  'transfer.generation.on_zaduzenje': {
    dependsOn: { key: 'transfer.generation.enabled', equals: true },
    detail: 'Isključeno: zaduženje sa skladišta odmah mijenja holdera bez prenosnice.',
  },
  'transfer.generation.on_prenos': {
    dependsOn: { key: 'transfer.generation.enabled', equals: true },
    detail: 'Isključeno: prenos osoba→osoba odmah mijenja holdera bez prenosnice.',
  },
  'transfer.generation.on_razduzenje': {
    dependsOn: { key: 'transfer.generation.enabled', equals: true },
    detail: 'Isključeno: razduženje odmah vraća opremu na skladište bez prenosnice.',
  },
  'transfer.generate_print_pdf': {
    dependsOn: { key: 'transfer.generation.enabled', equals: true },
    detail: 'Zahtijeva LibreOffice na serveru za konverziju DOCX u PDF.',
  },
  'transfer.require_signed_pdf_upload': {
    dependsOn: { key: 'transfer.generation.enabled', equals: true },
    detail: 'Primjenjuje se samo kad se kreira prenosnica. Bez uploada transfer se ne može finalizirati.',
  },
  'transfer.allow_evidenticar_cross_city': {
    detail: 'Ručni prenos opreme između gradova. Za promjenu org. jedinice radnika koristite modul Relocation.',
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
  'notifications.outbox.warn_backlog_count': {
    dependsOn: { key: 'notifications.enabled', equals: true },
    detail: 'Operativni alarm u logovima kada broj nedostavljenih notifikacija dosegne prag.',
  },
  'notifications.outbox.warn_age_seconds': {
    dependsOn: { key: 'notifications.enabled', equals: true },
    detail: 'Operativni alarm u logovima kada najstarija nedostavljena notifikacija postane previše stara.',
  },
  'queues.metrics.warn_backlog_count': {
    detail: 'Operativni alarm u logovima za depth inventory-close i document-generation redova.',
  },
  'queues.metrics.warn_waiting_seconds': {
    detail: 'Operativni alarm u logovima kada najstariji posao predugo čeka na obradu.',
  },
  'queues.metrics.warn_active_seconds': {
    detail: 'Operativni alarm u logovima kada aktivni posao predugo traje.',
  },
  'database.metrics.warn_latency_ms': {
    detail: 'Operativni alarm u logovima kada SELECT 1 proba predugo traje.',
  },
  'database.metrics.warn_waiting_count': {
    detail: 'Operativni alarm kada zahtjevi čekaju slobodnu PostgreSQL konekciju.',
  },
  'database.metrics.warn_utilization_percent': {
    detail: 'Operativni alarm kada je connection pool blizu svog konfigurisanog maksimuma.',
  },
  'redis.metrics.warn_ping_ms': {
    detail: 'Operativni alarm u logovima kada Redis PING proba predugo traje.',
  },
  'redis.metrics.warn_disconnect_seconds': {
    detail: 'Operativni alarm kada shared Redis konekcija predugo nije u ready stanju.',
  },
  'redis.metrics.warn_reconnect_count': {
    detail: 'Operativni alarm kada se od pokretanja procesa nakupi previše reconnect događaja.',
  },
  'upload.metrics.warn_reject_count': {
    detail: 'Operativni alarm u logovima kada se u 30 sekundi nakupi previše odbijenih upload zahtjeva.',
  },
  'http.metrics.warn_error_rate_percent': {
    detail: 'Operativni alarm u logovima kada udio 5xx odgovora u intervalu dosegne prag.',
  },
  'http.metrics.warn_p95_ms': {
    detail: 'Operativni alarm u logovima kada histogramska p95 latencija zahtjeva pređe prag.',
  },
  'http.metrics.warn_5xx_count': {
    detail: 'Operativni alarm u logovima nakon apsolutnog broja 5xx odgovora u intervalu.',
  },
  'http.metrics.min_request_count': {
    detail: 'Minimalan uzorak zahtjeva u intervalu prije nego stopa grešaka i p95 mogu aktivirati alarm.',
  },
  'transfer.template_placeholders_help': {
    display: 'info',
    detail: 'Referentna lista placeholdera za Word šablon prenosnice po skladištu.',
  },
};

export const getSettingUiMetadata = (key: string): SettingUiMetadata | undefined =>
  SETTINGS_UI_METADATA[key];
