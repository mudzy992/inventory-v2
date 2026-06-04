import type { LucideIcon } from 'lucide-react';
import {
  Building2,
  ArrowLeftRight,
  Upload,
  Bell,
  LayoutGrid,
} from 'lucide-react';
import type { SettingUiGroup } from './settings-ui-groups';

export type SettingsTabId = 'general' | 'modules' | 'transfers' | 'uploads' | 'notifications';

export interface SettingsTabMeta {
  id: SettingsTabId;
  label: string;
  icon: LucideIcon;
  description: string;
}

export const SETTINGS_TAB_ORDER: SettingsTabId[] = [
  'general',
  'modules',
  'transfers',
  'uploads',
  'notifications',
];

export const SETTINGS_TAB_META: Record<SettingsTabId, SettingsTabMeta> = {
  general: {
    id: 'general',
    label: 'Opšte',
    icon: Building2,
    description: 'Brending aplikacije i podaci preduzeća za štampu.',
  },
  modules: {
    id: 'modules',
    label: 'Moduli',
    icon: LayoutGrid,
    description: 'Uključivanje i isključivanje cjelina aplikacije (meni, API, pristup).',
  },
  transfers: {
    id: 'transfers',
    label: 'Prenosi',
    icon: ArrowLeftRight,
    description: 'Pravila prenosnica, zaduženja i cross-service logike.',
  },
  uploads: {
    id: 'uploads',
    label: 'Upload',
    icon: Upload,
    description: 'Ograničenja uploada skeniranih dokumenata.',
  },
  notifications: {
    id: 'notifications',
    label: 'Notifikacije',
    icon: Bell,
    description: 'In-app obavještenja i realtime.',
  },
};

const GROUP_TO_TAB: Record<SettingUiGroup, SettingsTabId> = {
  branding: 'general',
  company: 'general',
  modules: 'modules',
  transfers: 'transfers',
  uploads: 'uploads',
  notifications: 'notifications',
};

export const getSettingsTabForGroup = (group: string): SettingsTabId =>
  GROUP_TO_TAB[group as SettingUiGroup] ?? 'modules';
