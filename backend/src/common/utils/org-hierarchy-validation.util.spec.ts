import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import type { OrgUnitType } from '../../../generated/prisma/client';
import {
  assertValidOrgUnitParentChild,
  getAllowedChildTypes,
} from './org-hierarchy-validation.util';

const ALL_ORG_UNIT_TYPES: readonly OrgUnitType[] = [
  'direkcija',
  'podrucje',
  'distribucija',
  'podruznica',
  'sektor',
  'sluzba',
  'odjeljenje',
];

const EXPECTED_MATRIX: Record<OrgUnitType, readonly OrgUnitType[]> = {
  direkcija: ['podrucje', 'distribucija', 'sektor'],
  podrucje: ['sektor', 'sluzba', 'odjeljenje', 'distribucija'],
  distribucija: ['sektor', 'sluzba', 'odjeljenje', 'podruznica'],
  podruznica: ['sluzba', 'odjeljenje'],
  sektor: ['sluzba', 'odjeljenje'],
  sluzba: ['odjeljenje'],
  odjeljenje: [],
};

const FORBIDDEN_EDGE_CASES: ReadonlyArray<readonly [OrgUnitType, OrgUnitType]> = [
  ['odjeljenje', 'sluzba'],
  ['odjeljenje', 'sektor'],
  ['direkcija', 'sluzba'],
  ['direkcija', 'odjeljenje'],
  ['direkcija', 'podruznica'],
  ['podrucje', 'podruznica'],
  ['podrucje', 'direkcija'],
  ['distribucija', 'direkcija'],
  ['podruznica', 'sektor'],
  ['podruznica', 'distribucija'],
  ['sluzba', 'sektor'],
  ['sluzba', 'direkcija'],
  ['sektor', 'direkcija'],
  ['sektor', 'podrucje'],
];

const isAllowedChild = (parentType: OrgUnitType, childType: OrgUnitType): boolean =>
  EXPECTED_MATRIX[parentType].includes(childType);

describe('org-hierarchy-validation.util', () => {
  describe('getAllowedChildTypes', () => {
    for (const parentType of ALL_ORG_UNIT_TYPES) {
      it(`returns matrix children for parent "${parentType}"`, () => {
        const actual = getAllowedChildTypes(parentType);
        assert.deepEqual(actual, EXPECTED_MATRIX[parentType]);
      });
    }
  });

  describe('assertValidOrgUnitParentChild — allowed pairs', () => {
    for (const parentType of ALL_ORG_UNIT_TYPES) {
      for (const childType of EXPECTED_MATRIX[parentType]) {
        it(`allows ${parentType} -> ${childType}`, () => {
          assert.doesNotThrow(() => assertValidOrgUnitParentChild(parentType, childType));
        });
      }
    }
  });

  describe('assertValidOrgUnitParentChild — forbidden pairs', () => {
    for (const [parentType, childType] of FORBIDDEN_EDGE_CASES) {
      it(`rejects ${parentType} -> ${childType}`, () => {
        assert.throws(
          () => assertValidOrgUnitParentChild(parentType, childType),
          (error: unknown) => {
            assert.ok(error instanceof BadRequestException);
            const response = error.getResponse();
            const message =
              typeof response === 'string'
                ? response
                : typeof response === 'object' &&
                    response !== null &&
                    'message' in response
                  ? String((response as { message: unknown }).message)
                  : '';
            assert.match(message, new RegExp(childType));
            assert.match(message, new RegExp(parentType));
            return true;
          },
        );
      });
    }

    for (const parentType of ALL_ORG_UNIT_TYPES) {
      for (const childType of ALL_ORG_UNIT_TYPES) {
        if (isAllowedChild(parentType, childType)) {
          continue;
        }
        it(`rejects exhaustive invalid pair ${parentType} -> ${childType}`, () => {
          assert.throws(() => assertValidOrgUnitParentChild(parentType, childType));
        });
      }
    }
  });
});
