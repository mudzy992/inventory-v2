export const buildDocumentNumber = (year: number, sequence: number, isRashod: boolean): string => {
  if (isRashod) {
    return `R/${sequence}/${year}`;
  }
  return `${sequence}/${year}`;
};

export const sanitizeDocumentNumberForFilename = (documentNumber: string): string =>
  documentNumber.replace(/\//g, '-');

export const isLegacyDocumentNumber = (documentNumber: string): boolean =>
  documentNumber.startsWith('PRN-') || documentNumber.startsWith('DRAFT');

export const countYearlySequences = (
  documentNumbers: string[],
  year: number,
  isRashod: boolean,
): number => {
  let max = 0;
  for (const number of documentNumbers) {
    const parsed = parseDocumentSequence(number, year, isRashod);
    if (parsed !== null && parsed > max) {
      max = parsed;
    }
  }
  return max;
};

export const parseDocumentSequence = (
  documentNumber: string,
  year: number,
  isRashod: boolean,
): number | null => {
  if (isLegacyDocumentNumber(documentNumber)) {
    if (!documentNumber.includes(String(year))) {
      return null;
    }
    const rashodMarker = 'RASH';
    const hasRashod = documentNumber.includes(rashodMarker);
    if (isRashod !== hasRashod) {
      return null;
    }
    const parts = documentNumber.split('-');
    const last = parts[parts.length - 1];
    const seq = Number.parseInt(last ?? '', 10);
    return Number.isFinite(seq) ? seq : null;
  }
  const rashodMatch = documentNumber.match(/^R\/(\d+)\/(\d+)$/);
  const standardMatch = documentNumber.match(/^(\d+)\/(\d+)$/);
  if (isRashod && rashodMatch) {
    const docYear = Number.parseInt(rashodMatch[2] ?? '', 10);
    if (docYear !== year) {
      return null;
    }
    return Number.parseInt(rashodMatch[1] ?? '', 10);
  }
  if (!isRashod && standardMatch) {
    const docYear = Number.parseInt(standardMatch[2] ?? '', 10);
    if (docYear !== year) {
      return null;
    }
    return Number.parseInt(standardMatch[1] ?? '', 10);
  }
  return null;
};
