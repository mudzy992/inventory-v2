import { createHash } from 'node:crypto';

/**
 * Defence in depth for GET /transfers/:id/raw-document.
 *
 * The endpoint returns a generated `text/html` document built from business
 * data. `buildTransferRawDocumentHtml()` already escapes every dynamic text
 * node, but a single future regression (or a new field) could reintroduce
 * stored XSS in the application's own origin. This layer therefore:
 *
 *  1. validates the generated markup against a small tag allow-list and
 *     rejects any event handler / javascript: attribute or injected style,
 *  2. derives a hash-based CSP from the ACTUAL inline <style> blocks, so the
 *     browser can execute no scripts, load no external resources, submit no
 *     forms and cannot be framed,
 *  3. sends the document as an attachment by default (reversible to `inline`
 *     via TRANSFER_RAW_DOCUMENT_DISPOSITION), plus nosniff/no-store headers.
 *
 * CSP was deliberately omitted from the global HTTP hardening layer because
 * of this document; computing it here keeps it exact even if the stylesheet
 * changes. A downloaded file loses response headers when opened from disk, so
 * escaping remains the primary control — CSP is the second layer.
 */

export type TransferDocumentDisposition = 'attachment' | 'inline';
export const DEFAULT_TRANSFER_DOCUMENT_DISPOSITION: TransferDocumentDisposition = 'attachment';

export const resolveTransferDocumentDisposition = (
  raw: string | undefined,
): TransferDocumentDisposition => {
  if (raw === undefined || raw.trim() === '') return DEFAULT_TRANSFER_DOCUMENT_DISPOSITION;
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'attachment' || normalized === 'inline') return normalized;
  throw new Error('TRANSFER_RAW_DOCUMENT_DISPOSITION must be "attachment" or "inline"');
};

const ALLOWED_TAGS = new Set([
  'html',
  'head',
  'meta',
  'title',
  'style',
  'body',
  'h1',
  'p',
  'strong',
  'table',
  'tr',
  'th',
  'td',
  'br',
]);

export const extractStyleBlocks = (html: string): string[] =>
  [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/giu)].map((match) => match[1] ?? '');

export const styleSourceHash = (style: string): string =>
  createHash('sha256').update(style, 'utf8').digest('base64');

/** Returns a list of violations; empty means the document is safe to serve. */
export const verifyTransferDocumentSafety = (html: string): string[] => {
  const errors: string[] = [];
  if (!/^\s*<!DOCTYPE html>/iu.test(html)) {
    errors.push('missing HTML5 doctype');
  }
  for (const match of html.matchAll(/<(\/?)([a-z][a-z0-9-]*)\b([^>]*)>/giu)) {
    const name = (match[2] ?? '').toLowerCase();
    const attributes = match[3] ?? '';
    if (!ALLOWED_TAGS.has(name)) {
      errors.push(`disallowed HTML tag <${name}>`);
    }
    if (/\son[a-z]+\s*=/iu.test(attributes)) {
      errors.push(`inline event handler on <${name}>`);
    }
    if (/javascript:|data:text\/html/iu.test(attributes)) {
      errors.push(`unsafe URL scheme on <${name}>`);
    }
  }
  const styles = extractStyleBlocks(html);
  if (styles.length === 0) {
    errors.push('no inline <style> block to hash');
  }
  for (const style of styles) {
    if (style.includes('<')) {
      errors.push('inline <style> block contains raw markup');
    }
  }
  return errors;
};

export const assertSafeTransferDocument = (html: string): void => {
  const errors = verifyTransferDocumentSafety(html);
  if (errors.length === 0) return;
  throw new Error(`Unsafe generated transfer document: ${errors.join('; ')}`);
};

/** CSP built from the real style blocks — never a hard-coded, drifting hash. */
export const buildTransferDocumentCsp = (html: string): string => {
  const hashes = extractStyleBlocks(html).map((style) => `'sha256-${styleSourceHash(style)}'`);
  if (hashes.length === 0) {
    throw new Error('Cannot build a hash-based CSP without an inline <style> block');
  }
  return [
    "default-src 'none'",
    `style-src ${hashes.join(' ')}`,
    "script-src 'none'",
    "img-src 'none'",
    "font-src 'none'",
    "connect-src 'none'",
    "media-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    'sandbox',
  ].join('; ');
};

export const safeTransferDocumentFilename = (raw: string): string => {
  const base =
    raw
      .replace(/\.html?$/iu, '')
      .replace(/[^A-Za-z0-9._-]/gu, '-')
      .replace(/\.{2,}/gu, '.')
      .replace(/^[-.]+/u, '')
      .slice(0, 80) || 'prenosnica-raw';
  return `${base}.html`;
};

const documentNumberFromHtml = (html: string): string =>
  /<title>Prenosnica\s+([^<]*)<\/title>/iu.exec(html)?.[1]?.trim() ?? '';

export const buildTransferDocumentHeaders = (
  html: string,
  disposition: TransferDocumentDisposition = DEFAULT_TRANSFER_DOCUMENT_DISPOSITION,
): Record<string, string> => {
  assertSafeTransferDocument(html);
  const label = documentNumberFromHtml(html) || 'prenosnica-raw';
  const filename = safeTransferDocumentFilename(`prenosnica-${label}.html`);
  return {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': buildTransferDocumentCsp(html),
    'Content-Disposition': `${disposition}; filename="${filename}"`,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store',
  };
};
