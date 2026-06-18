import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isEmployeeEligibleForWarehouseCommittee,
  resolveEligibleCommitteeMembers,
} from './resolve-eligible-committee-members.util';

const maglajEmployee = {
  id: 'emp-maglaj',
  firstName: 'Ana',
  lastName: 'Maglaj',
  title: 'Referent',
  userId: 'user-maglaj',
  userIsActive: true,
};

describe('resolve-eligible-committee-members.util', () => {
  it('allows employee when effective warehouse matches committee warehouse regardless of city', async () => {
    const actual = await isEmployeeEligibleForWarehouseCommittee(
      maglajEmployee,
      { warehouseId: 'wh-zenica', assignmentUserIds: new Set(), employees: [] },
      { resolveEmployeeWarehouseId: async () => 'wh-zenica' },
    );
    assert.equal(actual, true);
  });

  it('rejects employee when effective warehouse differs and no registrar assignment', async () => {
    const actual = await isEmployeeEligibleForWarehouseCommittee(
      maglajEmployee,
      { warehouseId: 'wh-zenica', assignmentUserIds: new Set(), employees: [] },
      { resolveEmployeeWarehouseId: async () => 'wh-central' },
    );
    assert.equal(actual, false);
  });

  it('allows employee with registrar assignment even when effective warehouse differs', async () => {
    const actual = await isEmployeeEligibleForWarehouseCommittee(
      maglajEmployee,
      { warehouseId: 'wh-zenica', assignmentUserIds: new Set(['user-maglaj']), employees: [] },
      { resolveEmployeeWarehouseId: async () => 'wh-central' },
    );
    assert.equal(actual, true);
  });

  it('filters employee list by effective warehouse', async () => {
    const actual = await resolveEligibleCommitteeMembers(
      {
        warehouseId: 'wh-zenica',
        assignmentUserIds: new Set(),
        employees: [
          maglajEmployee,
          {
            id: 'emp-sarajevo',
            firstName: 'Ben',
            lastName: 'Sarajevo',
            title: 'Referent',
            userId: 'user-sarajevo',
            userIsActive: true,
          },
        ],
      },
      {
        resolveEmployeeWarehouseId: async (employeeId) =>
          employeeId === 'emp-maglaj' ? 'wh-zenica' : 'wh-sarajevo',
      },
    );
    assert.equal(actual.length, 1);
    assert.equal(actual[0]?.id, 'emp-maglaj');
  });
});
