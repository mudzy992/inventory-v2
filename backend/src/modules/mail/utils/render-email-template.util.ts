export type EmailTemplateVariables = Record<string, string | number | null | undefined>;

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);

const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

/** Varijable koje template pominje, jedinstvene i sortirane — koristi ih
 * admin editor za listu dostupnih varijabli i validaciju. */
export const extractTemplateVariables = (text: string): string[] => {
  const found = new Set<string>();
  for (const match of text.matchAll(VARIABLE_PATTERN)) {
    found.add(match[1]);
  }
  return [...found].sort();
};

/**
 * Zamjenjuje `{{variable}}` placeholder-e. Nepoznate varijable ostaju
 * netaknute da se greška vidi u pregledu umjesto da tiho nestane.
 * HTML kontekst escape-uje vrijednosti; subject i plain-text ne escape-uju.
 */
export const renderEmailTemplate = (
  template: string,
  variables: EmailTemplateVariables,
  context: 'html' | 'text',
): string =>
  template.replace(VARIABLE_PATTERN, (whole, name: string) => {
    const value = variables[name];
    if (value === null || value === undefined) {
      return whole;
    }
    const text = String(value);
    return context === 'html' ? escapeHtml(text) : text;
  });
