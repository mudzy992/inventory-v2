import { BadRequestException } from '@nestjs/common';
import type { TransferType } from '../../../../generated/prisma/client';

export type TransferCreationContext = 'api' | 'stock_lot' | 'inventory';

export interface TransferGenerationSettingsReader {
  getBooleanValue(key: string, defaultValue: boolean): Promise<boolean>;
}

const TYPE_SETTING_KEY: Record<TransferType, string> = {
  zaduzenje: 'transfer.generation.on_zaduzenje',
  prenos: 'transfer.generation.on_prenos',
  razduzenje: 'transfer.generation.on_razduzenje',
  rashodovanje: 'transfer.generation.on_rashodovanje',
};

export const resolveTransferGenerationSettingKey = (
  type: TransferType,
  context: TransferCreationContext,
): string => {
  if (context === 'stock_lot' && type === 'zaduzenje') {
    return 'transfer.generation.on_stock_lot_issue';
  }
  return TYPE_SETTING_KEY[type];
};

export const assertTransferCreationAllowed = async (
  settings: TransferGenerationSettingsReader,
  type: TransferType,
  context: TransferCreationContext,
): Promise<void> => {
  const masterEnabled = await settings.getBooleanValue('transfer.generation.enabled', true);
  if (!masterEnabled) {
    throw new BadRequestException(
      'Kreiranje prenosnica je isključeno (inicijalizacija / postavke).',
    );
  }
  const typeKey = resolveTransferGenerationSettingKey(type, context);
  const typeEnabled = await settings.getBooleanValue(typeKey, true);
  if (!typeEnabled) {
    throw new BadRequestException(`Kreiranje prenosnice za tip "${type}" je isključeno u postavkama.`);
  }
};

export const isTransferCreationAllowed = async (
  settings: TransferGenerationSettingsReader,
  type: TransferType,
  context: TransferCreationContext,
): Promise<boolean> => {
  try {
    await assertTransferCreationAllowed(settings, type, context);
    return true;
  } catch {
    return false;
  }
};
