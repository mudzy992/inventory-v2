import type { EquipmentStatus } from '@/types/models';

export interface StatusTheme {
  from: string;
  to: string;
  chipBg: string;
  chipInk: string;
}

export const STATUS_THEME: Record<EquipmentStatus | 'default', StatusTheme> = {
  zaduzeno: { from: '#059669', to: '#0d9488', chipBg: '#ecfdf5', chipInk: '#15803d' },
  skladiste: { from: '#2563eb', to: '#4f46e5', chipBg: '#eef2ff', chipInk: '#3730a3' },
  za_rashod: { from: '#ea580c', to: '#d97706', chipBg: '#fffbeb', chipInk: '#b45309' },
  rashodovano: { from: '#dc2626', to: '#e11d48', chipBg: '#fef2f2', chipInk: '#b91c1c' },
  default: { from: '#334155', to: '#0f172a', chipBg: '#f1f5f9', chipInk: '#5b6779' },
};

export const statusLabel = (status: string): string => {
  const labels: Record<string, string> = {
    skladiste: 'Na skladištu',
    zaduzeno: 'Zaduženo',
    za_rashod: 'Za rashod',
    rashodovano: 'Rashodovano',
    raw: 'RAW',
    printed: 'Štampano',
    uploaded: 'Upload',
    potpisan: 'Potpisan',
    cancelled: 'Otkazano',
    zaduzenje: 'Zaduženje',
    razduzenje: 'Razduženje',
    prenos: 'Prenos',
  };
  return labels[status] ?? status;
};

export const formatDate = (value: string): string => {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 10);
  }
  return date.toLocaleDateString('bs-BA', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export const resolveStatusTheme = (status?: string): StatusTheme => {
  if (status === 'zaduzeno' || status === 'skladiste' || status === 'za_rashod' || status === 'rashodovano') {
    return STATUS_THEME[status];
  }
  return STATUS_THEME.default;
};
