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
          AND: [
            { firstName: { contains: first, mode: 'insensitive' } },
            { lastName: { contains: last, mode: 'insensitive' } },
          ],
        },
        {
          AND: [
            { firstName: { contains: last, mode: 'insensitive' } },
            { lastName: { contains: first, mode: 'insensitive' } },
          ],
        },
        { firstName: { contains: trimmed, mode: 'insensitive' } },
        { lastName: { contains: trimmed, mode: 'insensitive' } },
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
