const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ParsedQr = { kind: 'uuid'; value: string } | { kind: 'search'; value: string };

export const parseEquipmentQr = (raw: string): ParsedQr => {
  let term = raw.trim();
  const pathMatch = /\/equipment\/([0-9a-f-]{36})/i.exec(term);
  if (pathMatch?.[1]) {
    term = pathMatch[1];
  } else if (term.startsWith('INVENTAR:')) {
    const parts = term.replace('INVENTAR:', '').split('|');
    term = parts[0] || parts[1] || term;
  }
  if (UUID_RE.test(term)) {
    return { kind: 'uuid', value: term };
  }
  return { kind: 'search', value: term };
};
