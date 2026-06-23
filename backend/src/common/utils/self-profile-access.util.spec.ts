import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AuthenticatedUser } from '../types/authenticated-user.type';
import {
  isEquipmentHeldByUser,
  isOwnHeldEquipmentListQuery,
  isOwnTransfersListQuery,
  isSelfEmployeeId,
  isTransferInvolvingUser,
} from './self-profile-access.util';

const user = (overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser => ({
  id: 'u1',
  username: 'mod',
  role: 'moderator',
  employeeId: 'emp-1',
  registrarScopes: [],
  coordinatorAssignments: [],
  moderatorOrgRoots: [],
  moderatorWarehouseIds: [],
  ...overrides,
});

describe('self-profile-access.util', () => {
  it('detects self employee id', () => {
    assert.equal(isSelfEmployeeId(user(), 'emp-1'), true);
    assert.equal(isSelfEmployeeId(user(), 'emp-2'), false);
  });

  it('detects own equipment list query', () => {
    assert.equal(isOwnHeldEquipmentListQuery(user(), 'emp-1'), true);
    assert.equal(isOwnHeldEquipmentListQuery(user(), 'emp-2'), false);
  });

  it('detects own transfers list query', () => {
    assert.equal(isOwnTransfersListQuery(user(), 'emp-1'), true);
    assert.equal(isOwnTransfersListQuery(user(), 'emp-2'), false);
  });

  it('detects equipment held by user', () => {
    assert.equal(isEquipmentHeldByUser(user(), { currentHolderId: 'emp-1' }), true);
    assert.equal(isEquipmentHeldByUser(user(), { currentHolderId: 'emp-2' }), false);
  });

  it('detects transfer involving user', () => {
    assert.equal(
      isTransferInvolvingUser(user(), { fromPersonId: 'emp-1', toPersonId: 'emp-9' }),
      true,
    );
    assert.equal(
      isTransferInvolvingUser(user(), { fromPersonId: 'emp-8', toPersonId: 'emp-9' }),
      false,
    );
  });
});
