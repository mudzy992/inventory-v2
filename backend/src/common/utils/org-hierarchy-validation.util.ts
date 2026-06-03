import { BadRequestException } from '@nestjs/common';
import type { OrgUnitType } from '../../../generated/prisma/client';

const ALLOWED_CHILD_TYPES: Record<OrgUnitType, readonly OrgUnitType[]> = {
  direkcija: ['podrucje', 'distribucija', 'sektor'],
  podrucje: ['sektor', 'sluzba', 'odjeljenje', 'distribucija'],
  distribucija: ['sektor', 'sluzba', 'odjeljenje', 'podruznica'],
  podruznica: ['sluzba', 'odjeljenje'],
  sektor: ['sluzba', 'odjeljenje'],
  sluzba: ['odjeljenje'],
  odjeljenje: [],
};

export const assertValidOrgUnitParentChild = (
  parentType: OrgUnitType,
  childType: OrgUnitType,
): void => {
  const allowed = ALLOWED_CHILD_TYPES[parentType];
  if (!allowed.includes(childType)) {
    throw new BadRequestException(
      `Org unit type "${childType}" cannot be a child of "${parentType}"`,
    );
  }
};

export const getAllowedChildTypes = (parentType: OrgUnitType): readonly OrgUnitType[] =>
  ALLOWED_CHILD_TYPES[parentType];
