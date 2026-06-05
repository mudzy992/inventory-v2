export type SettingUiGroup =
  | 'branding'
  | 'company'
  | 'lists'
  | 'modules'
  | 'transfers'
  | 'uploads'
  | 'notifications';

export const SETTINGS_UI_GROUP_LABELS: Record<SettingUiGroup, string> = {
  branding: 'Brending',
  company: 'Preduzeće',
  lists: 'Paginacija lista',
  modules: 'Moduli',
  transfers: 'Prenosi',
  uploads: 'Upload',
  notifications: 'Notifikacije',
};

export const SETTINGS_UI_GROUP_ORDER: SettingUiGroup[] = [
  'branding',
  'company',
  'lists',
  'modules',
  'transfers',
  'uploads',
  'notifications',
];
