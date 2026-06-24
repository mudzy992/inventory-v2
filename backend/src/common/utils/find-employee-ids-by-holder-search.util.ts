import type { Prisma } from '../../../generated/prisma/client';
import { buildEmployeeNameSearchWhere } from './employee-name-search.util';

const HOLDER_SEARCH_LIMIT = 100;

type PrismaEmployeeClient = {
  employee: {
    findMany: (args: Prisma.EmployeeFindManyArgs) => Promise<Array<{ id: string }>>;
  };
};

export const findEmployeeIdsByHolderSearch = async (
  prisma: PrismaEmployeeClient,
  searchTerm: string,
  employeeScopeWhere: Prisma.EmployeeWhereInput,
): Promise<string[]> => {
  const trimmed = searchTerm.trim();
  if (!trimmed) {
    return [];
  }
  const rows = await prisma.employee.findMany({
    where: {
      AND: [employeeScopeWhere, buildEmployeeNameSearchWhere(trimmed)],
    },
    select: { id: true },
    take: HOLDER_SEARCH_LIMIT,
  });
  return rows.map((row) => row.id);
};
