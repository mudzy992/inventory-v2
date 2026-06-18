import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeftRight,
  Bell,
  ClipboardList,
  FolderTree,
  Package,
  QrCode,
  Users,
  Warehouse,
} from 'lucide-react';
import { EVIDENS_APP_SUBTITLE } from '../ui/app-brand';

export interface SetupFeatureItem {
  id: string;
  icon: LucideIcon;
  title: string;
  description: string;
  accent: string;
  glow: string;
  highlights: string[];
}

export const SETUP_WELCOME_FEATURES: SetupFeatureItem[] = [
  {
    id: 'hierarchy',
    icon: FolderTree,
    title: 'Hijerarhijska evidencija',
    description:
      'Organizaciona struktura, kategorije opreme i dinamička polja — sve usklađeno sa vašim pravilima.',
    accent: 'bg-blue-50 text-blue-600 border-blue-100',
    glow: 'from-blue-500/20 to-transparent',
    highlights: ['Org. jedinice i direkcija na vrhu', 'Kategorije sa prilagođenim poljima', 'Potpisnici po hijerarhiji'],
  },
  {
    id: 'transfers',
    icon: ArrowLeftRight,
    title: 'Zaduženje i prenosnice',
    description:
      'Zaduženja po radnicima, generisanje prenosnica, potpisi i kompletna historija kretanja opreme.',
    accent: 'bg-teal-50 text-teal-600 border-teal-100',
    glow: 'from-teal-500/25 to-transparent',
    highlights: ['Zaduženje i razduženje', 'Word/PDF prenosnice', 'Audit trag svakog prenosa'],
  },
  {
    id: 'warehouse',
    icon: Warehouse,
    title: 'Skladišta i lotovi',
    description:
      'Prijem na skladište, specifikacije po jedinici, izdavanje i praćenje stanja u realnom vremenu.',
    accent: 'bg-indigo-50 text-indigo-600 border-indigo-100',
    glow: 'from-indigo-500/20 to-transparent',
    highlights: ['Prijem i specifikacija lota', 'Izdavanje po jedinici', 'Skladištar i keeper uloga'],
  },
  {
    id: 'catalog',
    icon: Package,
    title: 'Šifrarnik opreme',
    description: 'Katalog proizvoda po kategorijama — brži unos i konzistentna evidencija.',
    accent: 'bg-violet-50 text-violet-600 border-violet-100',
    glow: 'from-violet-500/20 to-transparent',
    highlights: ['Šifre i nazivi proizvoda', 'Veza sa leaf kategorijom', 'Autocomplete pri prijemu'],
  },
  {
    id: 'qr',
    icon: QrCode,
    title: 'QR naljepnice',
    description: 'Javni pregled opreme skeniranjem QR koda — idealno za inventuru na terenu.',
    accent: 'bg-cyan-50 text-cyan-600 border-cyan-100',
    glow: 'from-cyan-500/20 to-transparent',
    highlights: ['Štampa naljepnica', 'Javna stranica opreme', 'Brza identifikacija na terenu'],
  },
  {
    id: 'inventory',
    icon: ClipboardList,
    title: 'Popis i rashodovanje',
    description: 'Sesije popisa, komisije, liste za rashod i usklađenost sa stvarnim stanjem.',
    accent: 'bg-amber-50 text-amber-700 border-amber-100',
    glow: 'from-amber-500/20 to-transparent',
    highlights: ['Sesije popisa po distribuciji', 'Komisije za rashod', 'Zamrzavanje tokom popisa'],
  },
  {
    id: 'roles',
    icon: Users,
    title: 'Uloge i tim',
    description:
      'Administrator, evidentičar, skladištar, koordinator popisa i korisnik — svaka uloga sa jasnim ovlaštenjima.',
    accent: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    glow: 'from-emerald-500/20 to-transparent',
    highlights: ['5 uloga u instalaciji', 'Dodjele evidentičara', 'Koordinator po skladištu'],
  },
  {
    id: 'notifications',
    icon: Bell,
    title: 'Obavještenja',
    description: 'In-app notifikacije za ključne događaje — bez propuštenih zadataka u timu.',
    accent: 'bg-rose-50 text-rose-600 border-rose-100',
    glow: 'from-rose-500/20 to-transparent',
    highlights: ['Realtime osvježavanje', 'Nepročitana stanja', 'Događaji iz modula'],
  },
];

export const SETUP_INSTALL_PREVIEW = [
  { title: 'Preduzeće', detail: 'Naziv, adresa i podaci za dokumente' },
  { title: 'Lokacije', detail: 'Kanton i gradovi poslovanja' },
  { title: 'Organizacija', detail: 'Direkcija i opcionalna podjedinica' },
  { title: 'Skladište', detail: 'Glavno skladište za prijem opreme' },
  { title: 'Kategorije', detail: 'Kategorija opreme i šifrarnik' },
  { title: 'Tim', detail: 'Administrator + 4 uloge sa računima' },
  { title: 'Direktor', detail: 'Potpisnik na prenosnicama' },
  { title: 'Pregled', detail: 'Provjera i završetak instalacije' },
] as const;

export const SETUP_WELCOME_TAGLINE = EVIDENS_APP_SUBTITLE;

export const SETUP_WELCOME_INTRO =
  'Evidens je platforma za kompletnu evidenciju imovine u institucijama i firmama — od skladišta do zaduženog radnika, sa dokumentima i audit tragom.';
