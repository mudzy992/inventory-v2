export type SettingUiGroup =
  | 'branding'
  | 'company'
  | 'inventory'
  | 'lists'
  | 'modules'
  | 'transfers'
  | 'uploads'
  | 'notifications';

export const SETTINGS_UI_GROUP_LABELS: Record<SettingUiGroup, string> = {
  branding: 'Brending',
  company: 'Preduzeće',
  inventory: 'Inventura',
  lists: 'Paginacija lista',
  modules: 'Moduli',
  transfers: 'Prenosi',
  uploads: 'Upload',
  notifications: 'Notifikacije',
};

export const SETTINGS_UI_GROUP_ORDER: SettingUiGroup[] = [
  'branding',
  'company',
  'inventory',
  'lists',
  'modules',
  'transfers',
  'uploads',
  'notifications',
];
