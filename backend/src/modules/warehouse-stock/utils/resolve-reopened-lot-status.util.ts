import type { CanonicalStockLotResult } from './find-canonical-stock-lot.util';

export const resolveReopenedLotStatus = (
  lot: Pick<CanonicalStockLotResult, 'specDefinedAt' | 'status'>,
): 'ceka_specifikaciju' | 'spremno_za_izdavanje' =>
  lot.specDefinedAt ? 'spremno_za_izdavanje' : 'ceka_specifikaciju';
