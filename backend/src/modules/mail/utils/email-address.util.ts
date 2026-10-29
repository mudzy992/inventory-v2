const EMAIL_PATTERN = /^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$/;

export const isValidEmailAddress = (value: string): boolean =>
  EMAIL_PATTERN.test(value.trim());

/**
 * Parsira liste adresa razdvojene zarezom ili tačka-zarezom (tipičan unos u
 * To/CC/BCC polja). Vraća očišćene, deduplicirane adrese (bez obzira na
 * velika/mala slova kod deduplikacije).
 */
export const parseEmailAddressList = (raw: string | null | undefined): string[] => {
  if (!raw) {
    return [];
  }
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of raw.split(/[,;]/)) {
    const address = part.trim();
    if (!address) {
      continue;
    }
    const dedupeKey = address.toLowerCase();
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);
    result.push(address);
  }
  return result;
};

/** Vraća prvu nevalidnu adresu ili null — za precizne poruke o grešci. */
export const findInvalidEmailAddress = (addresses: string[]): string | null => {
  for (const address of addresses) {
    if (!isValidEmailAddress(address)) {
      return address;
    }
  }
  return null;
};
