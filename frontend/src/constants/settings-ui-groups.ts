export type SettingUiGroup =
  | 'branding'
  | 'company'
  | 'modules'
  | 'transfers'
  | 'uploads'
  | 'notifications';

export const SETTINGS_UI_GROUP_LABELS: Record<SettingUiGroup, string> = {
  branding: 'Brending',
  company: 'Preduzeće',
  modules: 'Moduli',
  transfers: 'Prenosi',
  uploads: 'Upload',
  notifications: 'Notifikacije',
};

export const SETTINGS_UI_GROUP_ORDER: SettingUiGroup[] = [
  'branding',
  'company',
  'modules',
  'transfers',
  'uploads',
  'notifications',
];
