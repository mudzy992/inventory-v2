import type { OrgUnitType } from '../../../generated/prisma/client';

export const MODERATOR_ASSIGNABLE_ORG_TYPES: readonly OrgUnitType[] = [
  'direkcija',
  'distribucija',
  'podrucje',
  'podruznica',
  'poslovna_jedinica',
  'sektor',
  'sluzba',
  'odjeljenje',
] as const;

export const MODERATOR_ASSIGNABLE_ORG_TYPE_SET = new Set<string>(MODERATOR_ASSIGNABLE_ORG_TYPES);

export const isModeratorAssignableOrgType = (type: string): boolean =>
  MODERATOR_ASSIGNABLE_ORG_TYPE_SET.has(type);
