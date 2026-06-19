import { BadRequestException } from '@nestjs/common';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import {
  TRANSFER_TEMPLATE_PLACEHOLDER_KEYS,
  TRANSFER_TEMPLATE_SAMPLE_DATA,
  type TransferTemplatePlaceholderKey,
} from '../../transfers/constants/transfer-template-placeholders';

export interface TransferTemplateValidationResult {
  valid: boolean;
  missingPlaceholders: TransferTemplatePlaceholderKey[];
  renderError?: string;
}

const PLACEHOLDER_PATTERN = /\{([a-z_]+)\}/g;

const extractDocumentXmlText = (zip: PizZip): string => {
  const entry = zip.file('word/document.xml');
  if (!entry) {
    throw new BadRequestException('Datoteka nije validan Word (.docx) obrazac — nedostaje word/document.xml');
  }
  return entry.asText();
};

const collectPlaceholdersFromXml = (documentXml: string): Set<string> => {
  const normalized = documentXml.replace(/<\/w:t>\s*<w:t[^>]*>/g, '');
  const found = new Set<string>();
  for (const match of normalized.matchAll(PLACEHOLDER_PATTERN)) {
    found.add(match[1] ?? '');
  }
  return found;
};

const renderTemplateDryRun = (buffer: Buffer): string | undefined => {
  try {
    const zip = new PizZip(buffer.toString('binary'));
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: '{', end: '}' },
    });
    doc.render(TRANSFER_TEMPLATE_SAMPLE_DATA);
    doc.toBuffer();
    return undefined;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Nepoznata greška rendera';
    return message;
  }
};

export const validateTransferTemplateBuffer = (
  buffer: Buffer,
): TransferTemplateValidationResult => {
  let zip: PizZip;
  try {
    zip = new PizZip(buffer.toString('binary'));
  } catch {
    return {
      valid: false,
      missingPlaceholders: [...TRANSFER_TEMPLATE_PLACEHOLDER_KEYS],
      renderError: 'Datoteka nije validan Word (.docx) obrazac',
    };
  }
  const documentXml = extractDocumentXmlText(zip);
  const found = collectPlaceholdersFromXml(documentXml);
  const missingPlaceholders = TRANSFER_TEMPLATE_PLACEHOLDER_KEYS.filter(
    (key) => !found.has(key),
  );
  if (missingPlaceholders.length > 0) {
    return { valid: false, missingPlaceholders };
  }
  const renderError = renderTemplateDryRun(buffer);
  if (renderError) {
    return {
      valid: false,
      missingPlaceholders: [],
      renderError,
    };
  }
  return { valid: true, missingPlaceholders: [] };
};

export const buildTransferTemplateValidationMessage = (
  result: TransferTemplateValidationResult,
): string => {
  if (result.missingPlaceholders.length > 0) {
    const tokens = result.missingPlaceholders.map((key) => `{${key}}`).join(', ');
    return `Obrazac ne sadrži obavezne placeholdere: ${tokens}. Koristite tačno ova polja u Word dokumentu.`;
  }
  if (result.renderError) {
    return `Obrazac nije ispravan za generisanje prenosnice: ${result.renderError}. Provjerite da su placeholderi ukucani kao običan tekst (bez bold/italic po riječima).`;
  }
  return 'Obrazac prenosnice nije ispravan';
};

export const assertTransferTemplateValid = (buffer: Buffer): void => {
  const result = validateTransferTemplateBuffer(buffer);
  if (!result.valid) {
    throw new BadRequestException(buildTransferTemplateValidationMessage(result));
  }
};
