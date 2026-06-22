import type { Prisma } from '../../../../generated/prisma/client';
import { buildDocumentNumber } from '../../../common/utils/document-number.util';

export const allocateTransferDocumentNumberInTx = async (
  tx: Prisma.TransactionClient,
  warehouseId: string,
  date: Date,
  isRashod: boolean,
): Promise<string> => {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const existing = await tx.transferDocumentSequence.findUnique({
    where: { warehouseId_year_month: { warehouseId, year, month } },
  });
  if (!existing) {
    await tx.transferDocumentSequence.create({
      data: {
        warehouseId,
        year,
        month,
        lastNumber: isRashod ? 0 : 1,
        rashodLastNumber: isRashod ? 1 : 0,
      },
    });
    return buildDocumentNumber(year, month, 1, isRashod);
  }
  if (isRashod) {
    const next = existing.rashodLastNumber + 1;
    await tx.transferDocumentSequence.update({
      where: { warehouseId_year_month: { warehouseId, year, month } },
      data: { rashodLastNumber: next },
    });
    return buildDocumentNumber(year, month, next, true);
  }
  const next = existing.lastNumber + 1;
  await tx.transferDocumentSequence.update({
    where: { warehouseId_year_month: { warehouseId, year, month } },
    data: { lastNumber: next },
  });
  return buildDocumentNumber(year, month, next, false);
};
