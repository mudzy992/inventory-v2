import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { UserRole } from '../../../generated/prisma/client';
import { ModeratorScopeService } from './moderator-scope.service';
import type { AuthenticatedUser } from '../types/authenticated-user.type';
import type { OrgScopeService } from './org-scope.service';
import type { PrismaService } from '../../prisma/prisma.service';

const authUser = (
  role: UserRole,
  overrides: Partial<AuthenticatedUser> = {},
): AuthenticatedUser => ({
  id: `${role}-user`,
  username: role,
  role,
  employeeId: null,
  registrarScopes: [],
  coordinatorAssignments: [],
  moderatorOrgRoots: [],
  moderatorWarehouseIds: [],
  ...overrides,
});

const createService = (options?: {
  orgUnits?: { id: string; type: string }[];
  warehouses?: { id: string; orgUnitId: string | null; isActive: boolean }[];
  warehouseConflicts?: { warehouseId: string }[];
  employees?: { id: string; orgUnitId: string }[];
}) => {
  const orgScopeService = {
    expandOrgUnitIds: async (rootIds: string[]) => {
      const expanded = new Set<string>();
      for (const rootId of rootIds) {
        expanded.add(rootId);
        if (rootId === 'dist-1') {
          expanded.add('branch-1');
        }
      }
      return [...expanded];
    },
  } as unknown as OrgScopeService;
  const prisma = {
    orgUnit: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        (options?.orgUnits ?? []).filter((row) => where.id.in.includes(row.id)),
    },
    warehouse: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        (options?.warehouses ?? []).filter((row) => where.id.in.includes(row.id)),
      findUnique: async ({ where }: { where: { id: string } }) =>
        (options?.warehouses ?? []).find((row) => row.id === where.id) ?? null,
    },
    moderatorWarehouseAssignment: {
      findMany: async () => options?.warehouseConflicts ?? [],
    },
    user: {
      findUnique: async () => null,
    },
    employee: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        (options?.employees ?? []).find((row) => row.id === where.id) ?? null,
    },
  } as unknown as PrismaService;
  return new ModeratorScopeService(prisma, orgScopeService);
};

describe('ModeratorScopeService', () => {
  it('returns null org filter for admin', async () => {
    const service = createService();
    const where = await service.buildScopedOrgUnitWhere(authUser('admin'));
    assert.equal(where, null);
  });

  it('expands moderator org roots into scoped org unit ids', async () => {
    const service = createService();
    const scopedIds = await service.resolveModeratorOrgUnitIds(
      authUser('moderator', { moderatorOrgRoots: ['dist-1'] }),
    );
    assert.deepEqual(scopedIds, ['dist-1', 'branch-1']);
  });

  it('rejects privileged role assignment by moderator', () => {
    const service = createService();
    assert.throws(
      () => service.assertCanAssignRole(authUser('moderator'), 'admin'),
      /Moderator ne može dodijeliti tu ulogu/,
    );
  });

  it('allows committee management for assigned warehouse', () => {
    const service = createService();
    const allowed = service.canManageInventoryCommittee(
      authUser('moderator', { moderatorWarehouseIds: ['wh-1'] }),
      'wh-1',
    );
    assert.equal(allowed, true);
  });

  it('validates moderator warehouse must be inside org scope', async () => {
    const service = createService({
      orgUnits: [{ id: 'dist-1', type: 'distribucija' }],
      warehouses: [{ id: 'wh-1', orgUnitId: 'branch-1', isActive: true }],
    });
    await assert.doesNotReject(() =>
      service.assertModeratorWarehouseAssignmentsValid(['dist-1'], ['wh-1']),
    );
  });

  it('assertWarehouseAssigned allows only assigned warehouses', async () => {
    const service = createService({
      warehouses: [{ id: 'wh-1', orgUnitId: 'dist-1', isActive: true }],
    });
    await assert.doesNotReject(() =>
      service.assertWarehouseAssigned(
        authUser('moderator', { moderatorOrgRoots: ['dist-1'], moderatorWarehouseIds: ['wh-1'] }),
        'wh-1',
      ),
    );
    await assert.rejects(
      () =>
        service.assertWarehouseAssigned(
          authUser('moderator', { moderatorOrgRoots: ['dist-1'], moderatorWarehouseIds: ['wh-1'] }),
          'wh-2',
        ),
      /nije u vašoj dodjeli/,
    );
  });

  it('buildEquipmentScopeWhere includes assigned warehouse equipment', async () => {
    const service = createService();
    const where = await service.buildEquipmentScopeWhere(
      authUser('moderator', { moderatorOrgRoots: ['dist-1'], moderatorWarehouseIds: ['wh-9'] }),
    );
    assert.ok(where && typeof where === 'object' && 'OR' in where);
    const orClauses = (where as { OR: object[] }).OR;
    assert.ok(orClauses.some((row) => JSON.stringify(row).includes('wh-9')));
  });

  it('rejects duplicate warehouse moderator assignment', async () => {
    const service = createService({
      orgUnits: [{ id: 'dist-1', type: 'distribucija' }],
      warehouses: [{ id: 'wh-1', orgUnitId: 'dist-1', isActive: true }],
      warehouseConflicts: [{ warehouseId: 'wh-1' }],
    });
    await assert.rejects(
      () => service.assertModeratorWarehouseAssignmentsValid(['dist-1'], ['wh-1']),
      /Skladište već ima dodijeljenog moderatora/,
    );
  });

  it('isEquipmentInScope allows equipment held by employee in org scope', async () => {
    const service = createService();
    const user = authUser('moderator', { moderatorOrgRoots: ['dist-1'], moderatorWarehouseIds: ['wh-other'] });
    const allowed = await service.isEquipmentInScope(
      user,
      { id: 'eq-1', warehouseId: 'wh-remote', currentHolderId: 'emp-1' },
      { orgUnitId: 'branch-1' },
    );
    assert.equal(allowed, true);
  });

  it('isEquipmentInScope denies equipment on unassigned warehouse without holder in scope', async () => {
    const service = createService({
      warehouses: [{ id: 'wh-remote', orgUnitId: 'other-org', isActive: true }],
    });
    const user = authUser('moderator', { moderatorOrgRoots: ['dist-1'], moderatorWarehouseIds: ['wh-1'] });
    const allowed = await service.isEquipmentInScope(
      user,
      { id: 'eq-1', warehouseId: 'wh-remote', currentHolderId: null },
      null,
      'other-org',
    );
    assert.equal(allowed, false);
  });

  it('assertEmployeeInScope allows employee in expanded org subtree', async () => {
    const service = createService({
      employees: [{ id: 'emp-1', orgUnitId: 'branch-1' }],
    });
    await assert.doesNotReject(() =>
      service.assertEmployeeInScope(
        authUser('moderator', { moderatorOrgRoots: ['dist-1'] }),
        'emp-1',
      ),
    );
  });

  it('canAccessTransfer allows transfer when equipment is in scope', async () => {
    const service = createService();
    const user = authUser('moderator', { moderatorOrgRoots: ['dist-1'], moderatorWarehouseIds: [] });
    const allowed = await service.canAccessTransfer(user, {
      equipment: { id: 'eq-1', warehouseId: null, currentHolderId: 'emp-1' },
      fromPerson: { orgUnitId: 'branch-1' },
      toPerson: { orgUnitId: 'other' },
      equipmentHolder: { orgUnitId: 'branch-1' },
    });
    assert.equal(allowed, true);
  });
});
