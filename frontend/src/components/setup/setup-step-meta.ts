import type { LucideIcon } from 'lucide-react';
import {
  Building2,
  CheckCircle2,
  FolderTree,
  MapPin,
  Package,
  Shield,
  User,
  Users,
  Warehouse,
} from 'lucide-react';

export interface SetupStepMeta {
  id: number;
  label: string;
  shortLabel: string;
  description: string;
  icon: LucideIcon;
}

export const SETUP_INSTALL_STEPS: SetupStepMeta[] = [
  {
    id: 1,
    label: 'Preduzeće',
    shortLabel: 'Firma',
    description: 'Osnovni podaci za dokumente i zaglavlja.',
    icon: Building2,
  },
  {
    id: 2,
    label: 'Lokacije',
    shortLabel: 'Lokacije',
    description: 'Kanton i gradovi gdje poslujete.',
    icon: MapPin,
  },
  {
    id: 3,
    label: 'Organizacija',
    shortLabel: 'Org',
    description: 'Direkcija na vrhu hijerarhije.',
    icon: FolderTree,
  },
  {
    id: 4,
    label: 'Skladište',
    shortLabel: 'Skladište',
    description: 'Glavno skladište za prijem opreme.',
    icon: Warehouse,
  },
  {
    id: 5,
    label: 'Kategorije',
    shortLabel: 'Katalog',
    description: 'Kategorija opreme i prva stavka šifrarnika.',
    icon: Package,
  },
  {
    id: 6,
    label: 'Administrator',
    shortLabel: 'Admin',
    description: 'Račun sa punim pristupom sistemu.',
    icon: User,
  },
  {
    id: 7,
    label: 'Tim',
    shortLabel: 'Tim',
    description: 'Korisnici za sve ključne uloge.',
    icon: Users,
  },
  {
    id: 8,
    label: 'Direktor',
    shortLabel: 'Signer',
    description: 'Potpisnik na prenosnicama.',
    icon: Shield,
  },
  {
    id: 9,
    label: 'Pregled',
    shortLabel: 'Pregled',
    description: 'Provjera prije završetka instalacije.',
    icon: CheckCircle2,
  },
];

export const SETUP_INSTALL_STEP_COUNT = SETUP_INSTALL_STEPS.length;

export const getSetupStepMeta = (step: number): SetupStepMeta =>
  SETUP_INSTALL_STEPS.find((s) => s.id === step) ?? SETUP_INSTALL_STEPS[0];
