import type { Prisma } from '../../../../generated/prisma/client';
import { buildDocumentNumber } from '../../../common/utils/document-number.util';

export const allocateTransferDocumentNumberInTx = async (
  tx: Prisma.TransactionClient,
  warehouseId: string,
  year: number,
  isRashod: boolean,
): Promise<string> => {
  const existing = await tx.transferDocumentSequence.findUnique({
    where: { warehouseId_year: { warehouseId, year } },
  });
  if (!existing) {
    await tx.transferDocumentSequence.create({
      data: {
        warehouseId,
        year,
        lastNumber: isRashod ? 0 : 1,
        rashodLastNumber: isRashod ? 1 : 0,
      },
    });
    return buildDocumentNumber(year, 1, isRashod);
  }
  if (isRashod) {
    const next = existing.rashodLastNumber + 1;
    await tx.transferDocumentSequence.update({
      where: { warehouseId_year: { warehouseId, year } },
      data: { rashodLastNumber: next },
    });
    return buildDocumentNumber(year, next, true);
  }
  const next = existing.lastNumber + 1;
  await tx.transferDocumentSequence.update({
    where: { warehouseId_year: { warehouseId, year } },
    data: { lastNumber: next },
  });
  return buildDocumentNumber(year, next, false);
};
