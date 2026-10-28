export const getRoleLabel = (role: string): string => {
  switch (role) {
    case 'admin':
      return 'Administrator';
    case 'moderator':
      return 'Moderator';
    case 'evidenticar':
      return 'Evidentičar';
    case 'popis_koordinator':
      return 'Koordinator popisa';
    case 'skladistar':
      return 'Skladištar';
    default:
      return 'Korisnik';
  }
};

/** Soft, AA-legible role tones for the light Evidens Surface shell. */
export const getRoleBadgeClass = (role: string): string => {
  switch (role) {
    case 'admin':
      return 'bg-amber-50 text-warning-ink ring-1 ring-inset ring-amber-600/20';
    case 'moderator':
      return 'bg-orange-50 text-warning-ink ring-1 ring-inset ring-orange-600/20';
    case 'evidenticar':
      return 'bg-purple-50 text-purple-800 ring-1 ring-inset ring-purple-600/20';
    case 'popis_koordinator':
      return 'bg-brand-soft text-brand-ink ring-1 ring-inset ring-brand/20';
    case 'skladistar':
      return 'bg-teal-50 text-teal-800 ring-1 ring-inset ring-teal-600/20';
    default:
      return 'bg-subtle text-ink-muted ring-1 ring-inset ring-line';
  }
};
