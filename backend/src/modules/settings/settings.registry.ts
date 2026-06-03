import type { SettingScope, SettingValueType } from '../../../generated/prisma/client';

export interface SettingDefinition {
  key: string;
  scope: SettingScope;
  valueType: SettingValueType;
  defaultValue: string | number | boolean;
  description: string;
}

export const SETTINGS_REGISTRY: readonly SettingDefinition[] = [
  {
    key: 'app.name',
    scope: 'public',
    valueType: 'string',
    defaultValue: 'Inventory v2',
    description: 'Prikazano ime aplikacije',
  },
  {
    key: 'app.subtitle',
    scope: 'public',
    valueType: 'string',
    defaultValue: 'Hijerarhijska evidencija i zaduženje opreme',
    description: 'Sub-naslov na početnoj stranici',
  },
  {
    key: 'features.qr_scanner',
    scope: 'public',
    valueType: 'boolean',
    defaultValue: true,
    description: 'Omogućava QR skener modul',
  },
  {
    key: 'features.cross_service_transfer',
    scope: 'private',
    valueType: 'boolean',
    defaultValue: true,
    description: 'Admin cross-service prenosi opreme',
  },
  {
    key: 'transfer.allow_finalize_without_upload',
    scope: 'private',
    valueType: 'boolean',
    defaultValue: false,
    description: 'Admin može finalizovati prenosnicu bez uploada potpisanog dokumenta',
  },
  {
    key: 'upload.max_mb',
    scope: 'private',
    valueType: 'number',
    defaultValue: 10,
    description: 'Maksimalna veličina uploada u MB',
  },
  {
    key: 'notifications.enabled',
    scope: 'public',
    valueType: 'boolean',
    defaultValue: true,
    description: 'In-app notifikacije',
  },
  {
    key: 'company.name',
    scope: 'public',
    valueType: 'string',
    defaultValue: '',
    description: 'Naziv preduzeća (header štampanih dokumenata)',
  },
  {
    key: 'company.address',
    scope: 'public',
    valueType: 'string',
    defaultValue: '',
    description: 'Adresa preduzeća',
  },
  {
    key: 'company.city',
    scope: 'public',
    valueType: 'string',
    defaultValue: '',
    description: 'Grad preduzeća',
  },
  {
    key: 'company.postalCode',
    scope: 'public',
    valueType: 'string',
    defaultValue: '',
    description: 'Poštanski broj preduzeća',
  },
  {
    key: 'company.phone',
    scope: 'public',
    valueType: 'string',
    defaultValue: '',
    description: 'Telefon preduzeća',
  },
  {
    key: 'company.email',
    scope: 'public',
    valueType: 'string',
    defaultValue: '',
    description: 'Email preduzeća',
  },
  {
    key: 'company.taxId',
    scope: 'public',
    valueType: 'string',
    defaultValue: '',
    description: 'ID/JIB preduzeća',
  },
  {
    key: 'app.initialized',
    scope: 'private',
    valueType: 'boolean',
    defaultValue: false,
    description: 'Aplikacija je inicijalizovana kroz setup wizard',
  },
] as const;

export const getSettingDefinition = (key: string): SettingDefinition | undefined =>
  SETTINGS_REGISTRY.find((entry) => entry.key === key);
