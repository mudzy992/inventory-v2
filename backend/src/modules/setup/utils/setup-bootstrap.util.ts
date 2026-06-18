export const EVIDENS_APP_NAME = 'Evidens';

export const slugifyCatalogCode = (value: string): string => {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return normalized.length > 0 ? normalized : 'STAVKA-001';
};

export const collectUsernames = (usernames: string[]): string[] => {
  const seen = new Set<string>();
  for (const raw of usernames) {
    const key = raw.trim().toLowerCase();
    if (seen.has(key)) {
      throw new Error(`DUPLICATE_USERNAME:${raw}`);
    }
    seen.add(key);
  }
  return usernames.map((u) => u.trim());
};
