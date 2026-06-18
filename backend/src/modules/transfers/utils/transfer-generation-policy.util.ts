import type { TransferType } from '../../../../generated/prisma/client';

export type TransferCreationContext = 'api' | 'stock_lot' | 'inventory';

export interface TransferGenerationSettingsReader {
  getBooleanValue(key: string, defaultValue: boolean): Promise<boolean>;
}

const TYPE_SETTING_KEY: Partial<Record<TransferType, string>> = {
  zaduzenje: 'transfer.generation.on_zaduzenje',
  prenos: 'transfer.generation.on_prenos',
  razduzenje: 'transfer.generation.on_razduzenje',
};

export const resolveTransferGenerationSettingKey = (
  type: TransferType,
  context: TransferCreationContext,
): string => {
  if (context === 'stock_lot' && type === 'zaduzenje') {
    return 'transfer.generation.on_stock_lot_issue';
  }
  const typeKey = TYPE_SETTING_KEY[type];
  if (!typeKey) {
    return `transfer.generation.on_${type}`;
  }
  return typeKey;
};

export const isTransferDocumentEnabled = async (
  settings: TransferGenerationSettingsReader,
  type: TransferType,
  context: TransferCreationContext,
): Promise<boolean> => {
  const masterEnabled = await settings.getBooleanValue('transfer.generation.enabled', true);
  if (!masterEnabled) {
    return false;
  }
  const typeKey = resolveTransferGenerationSettingKey(type, context);
  return settings.getBooleanValue(typeKey, true);
};

export const isStockLotTransferDocumentEnabled = async (
  settings: TransferGenerationSettingsReader,
): Promise<boolean> => isTransferDocumentEnabled(settings, 'zaduzenje', 'stock_lot');

/** @deprecated Use isTransferDocumentEnabled — kept for callers that expected boolean query */
export const isTransferCreationAllowed = isTransferDocumentEnabled;
