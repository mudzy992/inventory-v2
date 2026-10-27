import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PUBLIC_EQUIPMENT_DECISION,
  PUBLIC_EQUIPMENT_FIXTURE,
  PUBLIC_EQUIPMENT_MOVEMENTS_DEFAULT,
  PUBLIC_EQUIPMENT_MOVEMENTS_MAX,
  PUBLIC_EQUIPMENT_ORG_UNIT_MAX_DEPTH,
  PUBLIC_EQUIPMENT_PII_PATHS,
  PUBLIC_EQUIPMENT_SHAPES,
  assertPublicEquipmentShape,
  buildOrgUnitPath,
  resolvePublicEquipmentMovementLimit,
  verifyPublicEquipmentShape,
} from './public-equipment.contract';

const clone = (): Record<string, unknown> =>
  JSON.parse(JSON.stringify(PUBLIC_EQUIPMENT_FIXTURE)) as Record<string, unknown>;

test('the reviewed fixture satisfies the frozen public DTO contract', () => {
  assert.deepEqual(verifyPublicEquipmentShape(PUBLIC_EQUIPMENT_FIXTURE), []);
  assert.doesNotThrow(() => assertPublicEquipmentShape(clone()));
  assert.equal(PUBLIC_EQUIPMENT_DECISION.status, 'accepted-risk');
  assert.ok(PUBLIC_EQUIPMENT_PII_PATHS.length >= 8, 'the accepted PII exposure must be enumerated');
  assert.ok(PUBLIC_EQUIPMENT_SHAPES.root.includes('currentHolder'));
  assert.ok(PUBLIC_EQUIPMENT_SHAPES.root.includes('movements'));
});

test('an unreviewed top-level field is rejected at runtime and by the verifier', () => {
  const value = clone();
  value.email = 'ana@example.com';
  const errors = verifyPublicEquipmentShape(value);
  assert.ok(errors.some((error) => error.includes('unreviewed field') && error.includes('email')));
  assert.throws(() => assertPublicEquipmentShape(value), /privacy contract violated/u);
});

test('removing a field is also a contract change requiring review', () => {
  const value = clone();
  delete value.disposalReason;
  assert.ok(
    verifyPublicEquipmentShape(value).some((error) => error.includes('removed without an owner')),
  );
});

test('nested holder/warehouse shapes are frozen', () => {
  const holder = clone();
  (holder.currentHolder as Record<string, unknown>).phone = '061000000';
  assert.ok(verifyPublicEquipmentShape(holder).some((error) => error.includes('currentHolder')));

  const warehouse = clone();
  warehouse.warehouse = { name: 'Glavno', address: 'Ulica 1' };
  assert.ok(verifyPublicEquipmentShape(warehouse).some((error) => error.includes('warehouse')));
});

test('null holder and warehouse remain valid (no PII when unassigned)', () => {
  const value = clone();
  value.currentHolder = null;
  value.warehouse = null;
  assert.deepEqual(verifyPublicEquipmentShape(value), []);
});

test('array element shapes are frozen for movements and uniqueFields', () => {
  const movement = clone();
  (movement.movements as Record<string, unknown>[])[0].signerName = 'Marko';
  assert.ok(verifyPublicEquipmentShape(movement).some((error) => error.includes('movements[0]')));

  const unique = clone();
  (unique.uniqueFields as Record<string, unknown>[])[0].rawSerial = 'SN-1';
  assert.ok(verifyPublicEquipmentShape(unique).some((error) => error.includes('uniqueFields[0]')));
});

test('specifications is an opaque string map, not a place to leak nested objects', () => {
  const dynamic = clone();
  dynamic.specifications = { 'Custom field A': 'x', 'Custom field B': 'y' };
  assert.deepEqual(verifyPublicEquipmentShape(dynamic), []);

  const nested = clone();
  nested.specifications = { holder: { email: 'ana@example.com' } };
  assert.ok(verifyPublicEquipmentShape(nested).some((error) => error.includes('only string values')));

  const notAnObject = clone();
  notAnObject.specifications = 'raw';
  assert.ok(verifyPublicEquipmentShape(notAnObject).some((error) => error.includes('opaque object')));
});

test('an unbounded movement history cannot be published', () => {
  const value = clone();
  const entry = (value.movements as Record<string, unknown>[])[0];
  value.movements = Array.from({ length: PUBLIC_EQUIPMENT_MOVEMENTS_MAX + 1 }, () => ({ ...entry }));
  assert.ok(verifyPublicEquipmentShape(value).some((error) => error.includes('exceed the hard cap')));
});

test('non-object roots and wrong container types are rejected', () => {
  for (const bad of [null, undefined, 42, 'text', []]) {
    assert.ok(verifyPublicEquipmentShape(bad).length > 0);
  }
  const badArray = clone();
  badArray.movements = { 0: 'x' };
  assert.ok(verifyPublicEquipmentShape(badArray).some((error) => error.includes('expected an array')));
});

test('movement limit parsing is strict and fail-closed', () => {
  assert.equal(resolvePublicEquipmentMovementLimit(undefined), PUBLIC_EQUIPMENT_MOVEMENTS_DEFAULT);
  assert.equal(resolvePublicEquipmentMovementLimit('  '), PUBLIC_EQUIPMENT_MOVEMENTS_DEFAULT);
  assert.equal(resolvePublicEquipmentMovementLimit(' 25 '), 25);
  assert.equal(resolvePublicEquipmentMovementLimit(String(PUBLIC_EQUIPMENT_MOVEMENTS_MAX)), PUBLIC_EQUIPMENT_MOVEMENTS_MAX);
  for (const bad of ['0', '-1', '1.5', 'abc', '12abc', 'Infinity', String(PUBLIC_EQUIPMENT_MOVEMENTS_MAX + 1), '999999999999999999999']) {
    assert.throws(() => resolvePublicEquipmentMovementLimit(bad), /must be an integer between/u);
  }
});

test('org unit path is bounded, cycle-safe and stops at missing nodes', () => {
  const map = new Map<string, { id: string; name: string; parentId: string | null }>([
    ['root', { id: 'root', name: 'Direkcija', parentId: null }],
    ['child', { id: 'child', name: 'Sektor', parentId: 'root' }],
    ['leaf', { id: 'leaf', name: 'Podružnica', parentId: 'child' }],
  ]);
  assert.equal(buildOrgUnitPath(map, 'leaf'), 'Direkcija → Sektor → Podružnica');

  const cycle = new Map(map);
  cycle.set('root', { id: 'root', name: 'Direkcija', parentId: 'leaf' });
  assert.equal(buildOrgUnitPath(cycle, 'leaf'), 'Direkcija → Sektor → Podružnica');

  const chain = new Map<string, { id: string; name: string; parentId: string | null }>();
  for (let index = 0; index < PUBLIC_EQUIPMENT_ORG_UNIT_MAX_DEPTH + 5; index += 1) {
    chain.set(`n${index}`, {
      id: `n${index}`,
      name: `N${index}`,
      parentId: index === 0 ? null : `n${index - 1}`,
    });
  }
  assert.equal(buildOrgUnitPath(chain, `n${PUBLIC_EQUIPMENT_ORG_UNIT_MAX_DEPTH + 4}`).split(' → ').length, PUBLIC_EQUIPMENT_ORG_UNIT_MAX_DEPTH);
  assert.equal(buildOrgUnitPath(new Map(), 'missing'), '');
});
