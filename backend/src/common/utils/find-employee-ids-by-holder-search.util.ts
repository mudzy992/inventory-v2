import type { Prisma } from '../../../generated/prisma/client';
import { buildContainsSearchWhere } from './pagination.util';

const HOLDER_SEARCH_LIMIT = 100;

type PrismaEmployeeClient = {
  employee: {
    findMany: (args: Prisma.EmployeeFindManyArgs) => Promise<Array<{ id: string }>>;
  };
};

const buildHolderNameWhere = (searchTerm: string): Prisma.EmployeeWhereInput => {
  const parts = searchTerm.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const [first, ...rest] = parts;
    const last = rest.join(' ');
    return {
      OR: [
        {
          AND: [{ firstName: { contains: first } }, { lastName: { contains: last } }],
        },
        {
          AND: [{ firstName: { contains: last } }, { lastName: { contains: first } }],
        },
        { firstName: { contains: searchTerm } },
        { lastName: { contains: searchTerm } },
      ],
    };
  }
  const searchWhere = buildContainsSearchWhere(searchTerm, ['firstName', 'lastName']);
  return searchWhere ?? { id: '__no_match__' };
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
      AND: [employeeScopeWhere, buildHolderNameWhere(trimmed)],
    },
    select: { id: true },
    take: HOLDER_SEARCH_LIMIT,
  });
  return rows.map((row) => row.id);
};
