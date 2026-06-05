import type { Prisma } from '../../../generated/prisma/client';

export const TRANSFER_LIST_INCLUDE = {
  equipment: {
    select: {
      id: true,
      inventoryNumber: true,
      status: true,
      warehouseId: true,
      categoryId: true,
      currentHolder: { select: { id: true, firstName: true, lastName: true, orgUnitId: true } },
      warehouse: { select: { id: true, name: true, cityId: true } },
    },
  },
  signer: { select: { id: true, firstName: true, lastName: true } },
  fromPerson: { select: { id: true, firstName: true, lastName: true } },
  toPerson: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.TransferInclude;
