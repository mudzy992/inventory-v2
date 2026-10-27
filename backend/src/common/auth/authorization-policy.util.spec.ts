import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertSystemAdmin, isSystemAdmin, isSystemAdminUser } from './authorization-policy.util';

test('N-13: admin is the single source of truth for the privilege', () => {
  assert.equal(isSystemAdmin({ role: 'admin' }), true);
  assert.equal(isSystemAdmin({ role: 'moderator' }), false);
  assert.equal(isSystemAdmin({ role: 'evidenticar' }), false);
});

test('optional/unknown actors are never treated as admin', () => {
  assert.equal(isSystemAdmin(undefined), false);
  assert.equal(isSystemAdmin(null), false);
  assert.equal(isSystemAdmin({}), false);
  assert.equal(isSystemAdmin({ role: null }), false);
});

test('assertSystemAdmin fails closed for non-admins', () => {
  assert.doesNotThrow(() => assertSystemAdmin({ role: 'admin' }));
  assert.throws(() => assertSystemAdmin({ role: 'user' }), /System administrator/u);
});

test('isSystemAdminUser accepts the full AuthenticatedUser shape', () => {
  const user = {
    id: 'u1',
    username: 'admin',
    role: 'admin',
    employeeId: null,
    registrarScopes: [],
    coordinatorAssignments: [],
    moderatorOrgRoots: [],
    moderatorWarehouseIds: [],
  } as unknown as Parameters<typeof isSystemAdminUser>[0];
  assert.equal(isSystemAdminUser(user), true);
});
