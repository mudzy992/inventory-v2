import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import {
  assertModeratorOrgAssignmentsNotRedundant,
  isOrgUnitCoveredByModeratorAssignments,
} from './moderator-org-assignment-validation.util';

const tree = [
  { id: 'dir', name: 'Direkcija', parentId: null },
  { id: 'edz', name: 'ED Zenica', parentId: 'dir' },
  { id: 'ps', name: 'Područje snabdjevanja', parentId: 'dir' },
  { id: 'sekt', name: 'Sektor za IKT', parentId: 'dir' },
  { id: 'slz', name: 'Služba za IKT Zenica', parentId: 'sekt' },
  { id: 'slz-ed', name: 'Služba u ED Zenica', parentId: 'edz' },
];

describe('moderator-org-assignment-validation.util', () => {
  it('rejects direkcija + ED Zenica as redundant', () => {
    assert.throws(
      () =>
        assertModeratorOrgAssignmentsNotRedundant([tree[0]!, tree[1]!], tree),
      (error: unknown) =>
        error instanceof BadRequestException &&
        /ED Zenica je već pokrivena dodjelom Direkcija/.test(error.message),
    );
  });

  it('rejects ED Zenica + služba unutar ED stabla', () => {
    assert.throws(
      () =>
        assertModeratorOrgAssignmentsNotRedundant([tree[1]!, tree[5]!], tree),
      (error: unknown) =>
        error instanceof BadRequestException &&
        /Služba u ED Zenica je već pokrivena dodjelom ED Zenica/.test(error.message),
    );
  });

  it('allows disjoint ED Zenica and Područje snabdjevanja', () => {
    assert.doesNotThrow(() =>
      assertModeratorOrgAssignmentsNotRedundant([tree[1]!, tree[2]!], tree),
    );
  });

  it('detects covered org units for dropdown filtering', () => {
    const covered = isOrgUnitCoveredByModeratorAssignments('slz', ['dir'], tree);
    assert.equal(covered, true);
    const notCovered = isOrgUnitCoveredByModeratorAssignments('ps', ['edz'], tree);
    assert.equal(notCovered, false);
  });
});
