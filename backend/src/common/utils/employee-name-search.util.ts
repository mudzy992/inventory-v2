import type { Prisma } from '../../../generated/prisma/client';
import { buildContainsSearchWhere } from './pagination.util';

export const buildEmployeeNameSearchWhere = (searchTerm: string): Prisma.EmployeeWhereInput => {
  const trimmed = searchTerm.trim();
  if (!trimmed) {
    return { id: '__no_match__' };
  }
  const parts = trimmed.split(/\s+/).filter(Boolean);
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
        { firstName: { contains: trimmed } },
        { lastName: { contains: trimmed } },
      ],
    };
  }
  const searchWhere = buildContainsSearchWhere(trimmed, ['firstName', 'lastName']);
  return searchWhere ?? { id: '__no_match__' };
};

export const buildEmployeeSearchWhere = (searchTerm: string): Prisma.EmployeeWhereInput | null => {
  const trimmed = searchTerm.trim();
  if (!trimmed) {
    return null;
  }
  const nameWhere = buildEmployeeNameSearchWhere(trimmed);
  const otherFieldsWhere = buildContainsSearchWhere(trimmed, ['email', 'title', 'staffNumber']);
  if (otherFieldsWhere) {
    return { OR: [nameWhere, otherFieldsWhere] };
  }
  return nameWhere;
};
