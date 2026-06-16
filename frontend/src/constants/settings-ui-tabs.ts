import type { LucideIcon } from 'lucide-react';
import {
  Building2,
  ArrowLeftRight,
  Upload,
  Bell,
  LayoutGrid,
  List,
  CalendarRange,
} from 'lucide-react';
import type { SettingUiGroup } from './settings-ui-groups';

export type SettingsTabId = 'general' | 'inventory' | 'lists' | 'modules' | 'transfers' | 'uploads' | 'notifications';

export interface SettingsTabMeta {
  id: SettingsTabId;
  label: string;
  icon: LucideIcon;
  description: string;
}

export const SETTINGS_TAB_ORDER: SettingsTabId[] = [
  'general',
  'inventory',
  'lists',
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
    description: 'Brending aplikacije i službeni podaci preduzeća koji se štampaju na prenosnicama i izvještajima.',
  },
  inventory: {
    id: 'inventory',
    label: 'Inventura',
    icon: CalendarRange,
    description: 'Produkcijski režim popisa, kalendar i scheduler.',
  },
  lists: {
    id: 'lists',
    label: 'Liste',
    icon: List,
    description: 'Podrazumijevana i maksimalna veličina stranice za paginirane API liste.',
  },
  modules: {
    id: 'modules',
    label: 'Moduli',
    icon: LayoutGrid,
    description: 'Master prekidači za cijele module — isključen modul sakriva navigaciju i blokira pisanje na API-ju.',
  },
  transfers: {
    id: 'transfers',
    label: 'Prenosi',
    icon: ArrowLeftRight,
    description: 'Pravila kreiranja prenosnica, PDF-a i potpisanih dokumenata. Pod-opcije zahtijevaju uključeno globalno kreiranje.',
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
  inventory: 'inventory',
  lists: 'lists',
  modules: 'modules',
  transfers: 'transfers',
  uploads: 'uploads',
  notifications: 'notifications',
};

export const getSettingsTabForGroup = (group: string): SettingsTabId =>
  GROUP_TO_TAB[group as SettingUiGroup] ?? 'modules';
