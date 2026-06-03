export const buildDocumentNumber = (year: number, sequence: number, isRashod: boolean): string => {
  if (isRashod) {
    return `PRN-${year}-RASH-${String(sequence).padStart(4, '0')}`;
  }
  return `PRN-${year}-${String(sequence).padStart(4, '0')}`;
};

export const countYearlySequences = (
  documentNumbers: string[],
  year: number,
  isRashod: boolean,
): number => {
  const rashodMarker = 'RASH';
  return documentNumbers.filter((number) => {
    if (!number.includes(String(year))) {
      return false;
    }
    const hasRashod = number.includes(rashodMarker);
    return isRashod ? hasRashod : !hasRashod;
  }).length;
};
