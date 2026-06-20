import { ClipboardList, Package, Shield, User, CalendarRange, MapPinned } from 'lucide-react';
import type { ReactNode } from 'react';
import type { UserRole } from '../../types';

export const USER_ROLE_OPTIONS: UserRole[] = [
  'admin',
  'moderator',
  'evidenticar',
  'popis_koordinator',
  'skladistar',
  'user',
];

export const MODERATOR_ASSIGNABLE_ROLES: UserRole[] = [
  'evidenticar',
  'popis_koordinator',
  'skladistar',
  'user',
];

export const USER_ROLE_META: Record<
  UserRole,
  { label: string; color: string; icon: ReactNode; description: string }
> = {
  admin: {
    label: 'Administrator',
    color: 'bg-amber-100 text-amber-800',
    icon: <Shield size={12} />,
    description: 'Puna konfiguracija sistema',
  },
  moderator: {
    label: 'Moderator',
    color: 'bg-orange-100 text-orange-800',
    icon: <MapPinned size={12} />,
    description: 'Regionalna operativna administracija',
  },
  evidenticar: {
    label: 'Evidentičar',
    color: 'bg-purple-100 text-purple-800',
    icon: <ClipboardList size={12} />,
    description: 'Evidencija po gradu i kategoriji opreme',
  },
  popis_koordinator: {
    label: 'Koordinator popisa',
    color: 'bg-indigo-100 text-indigo-800',
    icon: <CalendarRange size={12} />,
    description: 'Definisanje komisija u draft sesiji popisa',
  },
  skladistar: {
    label: 'Skladištar',
    color: 'bg-teal-100 text-teal-800',
    icon: <Package size={12} />,
    description: 'Evidencija ulaza i stanja na skladištu',
  },
  user: {
    label: 'Korisnik',
    color: 'bg-gray-100 text-gray-800',
    icon: <User size={12} />,
    description: 'Pregled vlastitog zaduženja i QR',
  },
};
