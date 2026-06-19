export const TRANSFER_TEMPLATE_PLACEHOLDER_KEYS = [
  'broj_prenosnice',
  'predao',
  'preuzeo',
  'potpisnik',
  'inv_broj',
  'naziv_opreme',
  'obrazlozenje',
] as const;

export type TransferTemplatePlaceholderKey = (typeof TRANSFER_TEMPLATE_PLACEHOLDER_KEYS)[number];

export const TRANSFER_TEMPLATE_SAMPLE_DATA: Record<TransferTemplatePlaceholderKey, string> = {
  broj_prenosnice: '1/2026',
  predao: 'Test Predao',
  preuzeo: 'Test Preuzeo',
  potpisnik: 'Test Potpisnik',
  inv_broj: 'INV-001',
  naziv_opreme: 'Test oprema',
  obrazlozenje: 'Test obrazloženje',
};

export const formatTransferTemplatePlaceholder = (key: TransferTemplatePlaceholderKey): string =>
  `{${key}}`;

export const TRANSFER_TEMPLATE_PLACEHOLDER_TOKENS = TRANSFER_TEMPLATE_PLACEHOLDER_KEYS.map(
  formatTransferTemplatePlaceholder,
);
