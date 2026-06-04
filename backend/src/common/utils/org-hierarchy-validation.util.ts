import { BadRequestException } from '@nestjs/common';
import type { OrgUnitType } from '../../../generated/prisma/client';
import { formatInvalidParentChildMessage } from './org-hierarchy-messages.util';

const ALLOWED_CHILD_TYPES: Record<OrgUnitType, readonly OrgUnitType[]> = {
  direkcija: ['podrucje', 'distribucija', 'sektor', 'sluzba'],
  podrucje: ['podruznica', 'sektor', 'sluzba'],
  distribucija: ['podruznica', 'sektor', 'sluzba'],
  podruznica: ['poslovna_jedinica', 'sektor', 'sluzba'],
  poslovna_jedinica: ['sektor', 'sluzba', 'odjeljenje'],
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
      formatInvalidParentChildMessage(parentType, childType, allowed),
    );
  }
};

export const getAllowedChildTypes = (parentType: OrgUnitType): readonly OrgUnitType[] =>
  ALLOWED_CHILD_TYPES[parentType];
