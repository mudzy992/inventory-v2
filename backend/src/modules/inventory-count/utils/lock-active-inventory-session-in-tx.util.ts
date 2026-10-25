import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '../../../../generated/prisma/client';

export const lockActiveInventorySessionInTx = async (
  tx: Prisma.TransactionClient,
  sessionId: string,
): Promise<void> => {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "inventory_sessions"
    WHERE "id" = ${sessionId}
      AND "status" = 'active'
    FOR UPDATE
  `;
  if (rows.length !== 1) {
    throw new BadRequestException('Session is not active');
  }
};
