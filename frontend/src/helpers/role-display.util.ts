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

export const getRoleBadgeClass = (role: string): string => {
  switch (role) {
    case 'admin':
      return 'bg-amber-500 text-amber-900';
    case 'moderator':
      return 'bg-orange-500 text-orange-100';
    case 'evidenticar':
      return 'bg-purple-500 text-purple-100';
    case 'popis_koordinator':
      return 'bg-indigo-500 text-indigo-100';
    case 'skladistar':
      return 'bg-teal-500 text-teal-900';
    default:
      return 'bg-gray-500 text-gray-100';
  }
};
