import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as ts from 'typescript';
import {
  PUBLIC_EQUIPMENT_DECISION,
  PUBLIC_EQUIPMENT_FIXTURE,
  PUBLIC_EQUIPMENT_MOVEMENTS_DEFAULT,
  PUBLIC_EQUIPMENT_PII_PATHS,
  PUBLIC_EQUIPMENT_SHAPES,
  assertPublicEquipmentShape,
  verifyPublicEquipmentShape,
} from '../src/modules/public-equipment/public-equipment.contract';

/**
 * Release gate for GET /public/equipment/:id. The endpoint is unauthenticated
 * and publishes personal data by explicit owner decision, so ANY change to
 * the response shape (backend or frontend DTO) must be reviewed. This check
 * parses both TypeScript interfaces with the real compiler API, compares them
 * against the frozen contract, verifies the runtime assertion and the
 * operational caps, and proves the verifier actually rejects a new field.
 */

const ROOT = resolve('.');
const REPO = resolve(ROOT, '..');

const interfaceMembers = (file: string, interfaceName: string): string[] => {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  let members: string[] | undefined;
  source.forEachChild((node) => {
    if (ts.isInterfaceDeclaration(node) && node.name.text === interfaceName) {
      members = node.members
        .map((member) => (member.name && ts.isIdentifier(member.name) ? member.name.text : ''))
        .filter(Boolean)
        .sort();
    }
  });
  if (!members) {
    throw new Error(`Interface ${interfaceName} not found in ${file}`);
  }
  return members;
};

const assertSame = (label: string, actual: string[], expected: readonly string[]): void => {
  assert.deepEqual(
    actual,
    [...expected].sort(),
    `${label} diverges from the reviewed public QR privacy contract`,
  );
};

const main = (): void => {
  const backendService = resolve(ROOT, 'src/modules/public-equipment/public-equipment.service.ts');
  const backendDisplay = resolve(ROOT, 'src/common/utils/equipment-display.util.ts');
  const frontendDto = resolve(REPO, 'frontend/src/api/public-equipment-api.ts');

  // 1. Backend and frontend DTOs must both match the frozen contract.
  assertSame('backend PublicEquipmentResponse', interfaceMembers(backendService, 'PublicEquipmentResponse'), PUBLIC_EQUIPMENT_SHAPES.root);
  assertSame('backend PublicEquipmentHolder', interfaceMembers(backendService, 'PublicEquipmentHolder'), PUBLIC_EQUIPMENT_SHAPES.currentHolder);
  assertSame('backend PublicEquipmentWarehouse', interfaceMembers(backendService, 'PublicEquipmentWarehouse'), PUBLIC_EQUIPMENT_SHAPES.warehouse);
  assertSame('backend PublicEquipmentMovement', interfaceMembers(backendService, 'PublicEquipmentMovement'), PUBLIC_EQUIPMENT_SHAPES.movements);
  assertSame('backend UniqueFieldDisplay', interfaceMembers(backendDisplay, 'UniqueFieldDisplay'), PUBLIC_EQUIPMENT_SHAPES.uniqueFields);

  assertSame('frontend PublicEquipmentDto', interfaceMembers(frontendDto, 'PublicEquipmentDto'), PUBLIC_EQUIPMENT_SHAPES.root);
  assertSame('frontend PublicEquipmentHolderDto', interfaceMembers(frontendDto, 'PublicEquipmentHolderDto'), PUBLIC_EQUIPMENT_SHAPES.currentHolder);
  assertSame('frontend PublicEquipmentWarehouseDto', interfaceMembers(frontendDto, 'PublicEquipmentWarehouseDto'), PUBLIC_EQUIPMENT_SHAPES.warehouse);
  assertSame('frontend PublicEquipmentMovementDto', interfaceMembers(frontendDto, 'PublicEquipmentMovementDto'), PUBLIC_EQUIPMENT_SHAPES.movements);
  assertSame('frontend UniqueFieldDisplayDto', interfaceMembers(frontendDto, 'UniqueFieldDisplayDto'), PUBLIC_EQUIPMENT_SHAPES.uniqueFields);

  // 2. The representative payload and the runtime assertion are consistent.
  assert.deepEqual(verifyPublicEquipmentShape(PUBLIC_EQUIPMENT_FIXTURE), []);
  assert.doesNotThrow(() => assertPublicEquipmentShape(PUBLIC_EQUIPMENT_FIXTURE));
  const leaked = { ...PUBLIC_EQUIPMENT_FIXTURE, email: 'ana@example.com' };
  assert.ok(
    verifyPublicEquipmentShape(leaked).some((error) => error.includes('email')),
    'the gate itself must detect a newly added public field',
  );
  assert.equal(PUBLIC_EQUIPMENT_DECISION.status, 'accepted-risk');
  assert.ok(PUBLIC_EQUIPMENT_PII_PATHS.length >= 8);

  // 3. Operational guards in production code.
  const service = readFileSync(backendService, 'utf8');
  for (const expected of [
    'assertPublicEquipmentShape(',
    'resolvePublicEquipmentMovementLimit(',
    'take: this.movementLimit',
    'loadOrgUnitAncestors',
  ]) {
    assert.ok(service.includes(expected), `PublicEquipmentService must use ${expected}`);
  }
  assert.equal(
    /orgUnit\.findMany\(/u.test(service),
    false,
    'public QR must not load the entire org-unit tree',
  );

  const controller = readFileSync(
    resolve(ROOT, 'src/modules/public-equipment/public-equipment.controller.ts'),
    'utf8',
  );
  assert.match(controller, /@UseGuards\(PublicEquipmentRateLimitGuard\)/u);
  assert.match(controller, /@Get\(':id'\)/u);
  assert.equal((controller.match(/@Get\(/gu) ?? []).length, 1, 'no extra public GET routes');
  assert.match(service, /features\.public_equipment_lookup/u);

  // 4. Deployment configuration and the owner decision are documented.
  const envExample = readFileSync(resolve(REPO, '.env.example'), 'utf8');
  assert.match(envExample, /PUBLIC_EQUIPMENT_MAX_MOVEMENTS/u);
  for (const compose of ['docker-compose.yml', 'docker-compose.prod.yml']) {
    assert.match(
      readFileSync(resolve(REPO, compose), 'utf8'),
      /PUBLIC_EQUIPMENT_MAX_MOVEMENTS/u,
      `${compose} must expose the movement cap`,
    );
  }
  const guide = readFileSync(resolve(REPO, 'docs/public-qr-privacy.md'), 'utf8');
  assert.match(guide, /accepted-risk/u);
  assert.match(guide, /PUBLIC_EQUIPMENT_MAX_MOVEMENTS/u);
  for (const field of PUBLIC_EQUIPMENT_SHAPES.root) {
    assert.ok(guide.includes(field), `privacy guide must document the public field ${field}`);
  }

  console.log(
    `Public QR privacy contract passed (${PUBLIC_EQUIPMENT_SHAPES.root.length} reviewed fields, ` +
      `${PUBLIC_EQUIPMENT_PII_PATHS.length} documented PII paths, backend+frontend DTOs in sync, ` +
      `default history cap ${PUBLIC_EQUIPMENT_MOVEMENTS_DEFAULT}, runtime assertion + rate limit enforced).`,
  );
};

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
