// Spreadsheet applications may ignore leading ASCII control characters before formula markers.
// eslint-disable-next-line no-control-regex
const SPREADSHEET_FORMULA_PREFIX = /^[\s\u0000-\u001f\ufeff]*[=+\-@]/u;

export const escapeCsvCell = (value: string | null | undefined): string => {
  const raw = value ?? '';
  const formulaSafe = SPREADSHEET_FORMULA_PREFIX.test(raw) ? `'${raw}` : raw;
  if (/[",\r\n]/u.test(formulaSafe)) {
    return `"${formulaSafe.replace(/"/gu, '""')}"`;
  }
  return formulaSafe;
};
