const padMonth = (month: number): string => String(month).padStart(2, '0');

export const buildDocumentNumber = (
  year: number,
  month: number,
  sequence: number,
  isRashod: boolean,
): string => {
  const monthPart = padMonth(month);
  if (isRashod) {
    return `R/${sequence}-${monthPart}/${year}`;
  }
  return `${sequence}-${monthPart}/${year}`;
};

export const sanitizeDocumentNumberForFilename = (documentNumber: string): string =>
  documentNumber.replace(/\//g, '-');

export const isLegacyDocumentNumber = (documentNumber: string): boolean =>
  documentNumber.startsWith('PRN-') || documentNumber.startsWith('DRAFT');

const parseLegacyDraftSequence = (
  documentNumber: string,
  year: number,
  isRashod: boolean,
): number | null => {
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
};

export const parseDocumentSequence = (
  documentNumber: string,
  year: number,
  month: number,
  isRashod: boolean,
): number | null => {
  if (isLegacyDocumentNumber(documentNumber)) {
    return parseLegacyDraftSequence(documentNumber, year, isRashod);
  }
  const rashodMatch = documentNumber.match(/^R\/(\d+)-(\d{2})\/(\d{4})$/);
  const standardMatch = documentNumber.match(/^(\d+)-(\d{2})\/(\d{4})$/);
  const yearlyRashodMatch = documentNumber.match(/^R\/(\d+)\/(\d{4})$/);
  const yearlyStandardMatch = documentNumber.match(/^(\d+)\/(\d{4})$/);
  if (isRashod && rashodMatch) {
    const docYear = Number.parseInt(rashodMatch[3] ?? '', 10);
    const docMonth = Number.parseInt(rashodMatch[2] ?? '', 10);
    if (docYear !== year || docMonth !== month) {
      return null;
    }
    return Number.parseInt(rashodMatch[1] ?? '', 10);
  }
  if (!isRashod && standardMatch) {
    const docYear = Number.parseInt(standardMatch[3] ?? '', 10);
    const docMonth = Number.parseInt(standardMatch[2] ?? '', 10);
    if (docYear !== year || docMonth !== month) {
      return null;
    }
    return Number.parseInt(standardMatch[1] ?? '', 10);
  }
  if (isRashod && yearlyRashodMatch) {
    const docYear = Number.parseInt(yearlyRashodMatch[2] ?? '', 10);
    if (docYear !== year) {
      return null;
    }
    return Number.parseInt(yearlyRashodMatch[1] ?? '', 10);
  }
  if (!isRashod && yearlyStandardMatch) {
    const docYear = Number.parseInt(yearlyStandardMatch[2] ?? '', 10);
    if (docYear !== year) {
      return null;
    }
    return Number.parseInt(yearlyStandardMatch[1] ?? '', 10);
  }
  return null;
};

export const countMonthlySequences = (
  documentNumbers: string[],
  year: number,
  month: number,
  isRashod: boolean,
): number => {
  let max = 0;
  for (const number of documentNumbers) {
    const parsed = parseDocumentSequence(number, year, month, isRashod);
    if (parsed !== null && parsed > max) {
      max = parsed;
    }
  }
  return max;
};

/** @deprecated use countMonthlySequences */
export const countYearlySequences = (
  documentNumbers: string[],
  year: number,
  isRashod: boolean,
): number => {
  let max = 0;
  for (let month = 1; month <= 12; month += 1) {
    const monthlyMax = countMonthlySequences(documentNumbers, year, month, isRashod);
    if (monthlyMax > max) {
      max = monthlyMax;
    }
  }
  return max;
};
