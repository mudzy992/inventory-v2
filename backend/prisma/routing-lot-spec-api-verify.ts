import { config } from 'dotenv';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import jwt from 'jsonwebtoken';
import { createPrismaClient } from '../src/prisma/create-prisma-client';

config({ path: resolve(__dirname, '../../.env') });

const API = process.env.SMOKE_API_BASE ?? 'http://localhost:3000/backend';

type Json = Record<string, unknown>;

const results: { label: string; ok: boolean; detail?: string }[] = [];

const assert = (label: string, ok: boolean, detail?: string): void => {
  results.push({ label, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
};

const signAccessToken = (user: { id: string; username: string; role: string }): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is required when login credentials are unavailable');
  }
  return jwt.sign({ sub: user.id, username: user.username, role: user.role }, secret, { expiresIn: '1h' });
};

const request = async (
  method: string,
  path: string,
  token?: string,
  body?: Json,
): Promise<{ status: number; json: Json; ms: number }> => {
  const started = performance.now();
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await response.json().catch(() => ({}))) as Json;
  return { status: response.status, json, ms: Math.round(performance.now() - started) };
};

const resolveToken = async (
  user: { id: string; username: string; role: string },
  passwordEnvKey: string,
  defaultPassword: string,
): Promise<{ token: string; via: 'login' | 'jwt' }> => {
  const password = process.env[passwordEnvKey] ?? defaultPassword;
  const loginRes = await request('POST', '/auth/login', undefined, { username: user.username, password });
  const accessToken = String((loginRes.json as { accessToken?: string }).accessToken ?? '');
  if (accessToken.length > 10) {
    return { token: accessToken, via: 'login' };
  }
  return { token: signAccessToken(user), via: 'jwt' };
};

type CategoryField = {
  id: string;
  name: string;
  type: 'text' | 'number' | 'date' | 'select';
  required?: boolean;
  unique?: boolean;
  options?: string[];
};

const buildLotSpecifications = (
  _fields: CategoryField[],
  optionalFields: CategoryField[],
  overrides: Record<string, string> = {},
): Record<string, string> => {
  const lotFields = optionalFields;
  const specs: Record<string, string> = {};
  for (const field of lotFields) {
    if (overrides[field.id] !== undefined) {
      specs[field.id] = overrides[field.id];
      continue;
    }
    if (field.required === false) {
      continue;
    }
    const isSelectField = field.type === 'select' || (field.options?.length ?? 0) > 0;
    if (isSelectField) {
      if (!field.options?.length) {
        continue;
      }
      specs[field.id] = String(field.options[0]);
    } else if (field.type === 'number') {
      specs[field.id] = '1';
    } else if (field.type === 'date') {
      specs[field.id] = '2024-01-01';
    } else {
      specs[field.id] = `test-${field.id}`;
    }
  }
  return specs;
};

const buildIssueSpecifications = (
  fields: CategoryField[],
  _optionalFields: CategoryField[],
): Record<string, string> => {
  const specs: Record<string, string> = {};
  for (const field of fields) {
    specs[field.id] = field.type === 'number' ? '1' : `SN-${randomUUID().slice(0, 8)}`;
  }
  return specs;
};

const patchSpec = async (
  token: string,
  lotId: string,
  specifications: Record<string, string>,
): Promise<{ status: number; json: Json }> => {
  return request('PATCH', `/stock-lots/${lotId}/specifications`, token, { specifications });
};

const main = async (): Promise<void> => {
  const prisma = createPrismaClient();
  const cleanupLotIds: string[] = [];
  const cleanupEquipmentIds: string[] = [];
  const cleanupWarehouseId: string | null = null;
  let cleanupSessionId: string | null = null;

  const adminUser = await prisma.user.findFirst({
    where: { role: 'admin', isActive: true },
    select: { id: true, username: true, role: true },
  });
  if (!adminUser) {
    throw new Error('No active admin user in database');
  }

  const registrarUser = await prisma.user.findFirst({
    where: { role: 'evidenticar', isActive: true, registrarAssignments: { some: {} } },
    include: { registrarAssignments: true, employee: { select: { id: true } } },
  });
  if (!registrarUser || registrarUser.registrarAssignments.length === 0) {
    throw new Error('No evidenticar with registrar assignments in database');
  }

  const assignment = registrarUser.registrarAssignments[0];
  const categoryRows = await prisma.category.findMany({
    select: { id: true, parentId: true, fields: true, optionalFields: true },
  });
  const childrenByParent = new Map<string | null, string[]>();
  for (const row of categoryRows) {
    const list = childrenByParent.get(row.parentId) ?? [];
    list.push(row.id);
    childrenByParent.set(row.parentId, list);
  }
  const expandedCategoryIds = new Set<string>();
  const visitCategory = (categoryId: string): void => {
    if (expandedCategoryIds.has(categoryId)) {
      return;
    }
    expandedCategoryIds.add(categoryId);
    for (const childId of childrenByParent.get(categoryId) ?? []) {
      visitCategory(childId);
    }
  };
  visitCategory(assignment.categoryId);
  const getLotFields = (row: (typeof categoryRows)[number]): CategoryField[] =>
    ((row.optionalFields as CategoryField[]) ?? []);

  const canBuildLotSpec = (row: (typeof categoryRows)[number]): boolean => {
    try {
      const specs = buildLotSpecifications(
        (row.fields as CategoryField[]) ?? [],
        (row.optionalFields as CategoryField[]) ?? [],
      );
      return Object.keys(specs).length > 0;
    } catch {
      return false;
    }
  };

  const leafCategory = categoryRows.find(
    (row) =>
      expandedCategoryIds.has(row.id)
      && (childrenByParent.get(row.id) ?? []).length === 0
      && canBuildLotSpec(row),
  );
  if (!leafCategory) {
    throw new Error('No in-scope leaf category with buildable lot spec found');
  }

  const categoryFields = (leafCategory.fields as CategoryField[]) ?? [];
  const categoryOptionalFields = (leafCategory.optionalFields as CategoryField[]) ?? [];
  const lotFieldId = getLotFields(leafCategory).find(
    (field) => field.required !== false && field.type === 'text',
  )?.id ?? getLotFields(leafCategory)[0]?.id;
  if (!lotFieldId) {
    throw new Error(`Leaf category ${leafCategory.id} has no lot field for lot spec test`);
  }
  const buildSpec = (overrides: Record<string, string> = {}) =>
    buildLotSpecifications(categoryFields, categoryOptionalFields, overrides);

  const adminAuth = await resolveToken(adminUser, 'SMOKE_ADMIN_PASSWORD', 'admin123');
  const registrarAuth = await resolveToken(registrarUser, 'SMOKE_REGISTRAR_PASSWORD', 'user123');
  assert('A0 admin auth', adminAuth.token.length > 10, adminAuth.via);
  assert('A0 evidenticar auth', registrarAuth.token.length > 10, `${registrarAuth.via} (${registrarUser.username})`);

  const createLot = async (
    warehouseId: string,
    categoryId: string,
    status: 'ceka_specifikaciju' | 'spremno_za_izdavanje' | 'zatvoreno',
  ) => {
    const lot = await prisma.warehouseStockLot.create({
      data: {
        warehouseId,
        categoryId,
        productName: `API verify ${status} ${randomUUID().slice(0, 8)}`,
        quantityReceived: status === 'zatvoreno' ? 1 : 3,
        quantityOnHand: status === 'zatvoreno' ? 0 : 3,
        status,
        specifications: status === 'ceka_specifikaciju' ? {} : buildSpec({ [lotFieldId]: 'Initial' }),
        entryDate: new Date('2024-06-01'),
        receivedByUserId: adminUser.id,
      },
    });
    cleanupLotIds.push(lot.id);
    return lot.id;
  };

  const scopedWarehouseId = assignment.warehouseId;
  const scopedCategoryId = leafCategory.id;

  const cekaLotId = await createLot(scopedWarehouseId, scopedCategoryId, 'ceka_specifikaciju');
  const firstSave = await patchSpec(registrarAuth.token, cekaLotId, buildSpec({ [lotFieldId]: 'HP' }));
  if (firstSave.status !== 200) {
    console.log('  A1 error:', JSON.stringify(firstSave.json));
  }
  assert(
    'A1 ceka → first save → 200 + spremno',
    firstSave.status === 200 && (firstSave.json as { status?: string }).status === 'spremno_za_izdavanje',
    `status=${firstSave.status} lot=${String((firstSave.json as { status?: string }).status)}`,
  );
  assert(
    'A1 specDefinedAt returned',
    Boolean((firstSave.json as { specDefinedAt?: string }).specDefinedAt),
  );

  const secondSave = await patchSpec(registrarAuth.token, cekaLotId, buildSpec({ [lotFieldId]: 'Lenovo' }));
  const dbLotAfterUpdate = await prisma.warehouseStockLot.findUnique({
    where: { id: cekaLotId },
    select: { status: true, specifications: true },
  });
  const secondSpecs = (dbLotAfterUpdate?.specifications ?? {}) as Record<string, string>;
  assert(
    'A2 spremno → update spec → 200, status unchanged',
    secondSave.status === 200
      && dbLotAfterUpdate?.status === 'spremno_za_izdavanje'
      && secondSpecs[lotFieldId] === 'Lenovo',
    `status=${secondSave.status} ${lotFieldId}=${String(secondSpecs[lotFieldId])}`,
  );

  const closedLotId = await createLot(scopedWarehouseId, scopedCategoryId, 'zatvoreno');
  const closedSave = await patchSpec(registrarAuth.token, closedLotId, buildSpec({ [lotFieldId]: 'X' }));
  assert('A3 zatvoreno → 400', closedSave.status === 400, String(closedSave.status));

  const outOfScopeWarehouse = await prisma.warehouse.findFirst({
    where: { id: { not: scopedWarehouseId }, isActive: true },
    select: { id: true, cityId: true, orgUnitId: true },
  });
  if (outOfScopeWarehouse?.orgUnitId) {
    const outOfScopeLot = await createLot(outOfScopeWarehouse.id, scopedCategoryId, 'ceka_specifikaciju');
    const scopeDenied = await patchSpec(registrarAuth.token, outOfScopeLot, buildSpec({ [lotFieldId]: 'Dell' }));
    assert('A4 out-of-scope assignment → 403', scopeDenied.status === 403, String(scopeDenied.status));
  } else {
    console.log('SKIP A4 — no alternate warehouse with orgUnitId');
  }

  const freezeLotId = await createLot(scopedWarehouseId, scopedCategoryId, 'ceka_specifikaciju');
  const warehouseCity = await prisma.warehouse.findUnique({
    where: { id: scopedWarehouseId },
    select: { cityId: true, orgUnitId: true },
  });
  if (warehouseCity?.orgUnitId) {
    const session = await prisma.inventorySession.create({
      data: {
        name: `API verify freeze ${randomUUID().slice(0, 6)}`,
        status: 'active',
        orgUnitId: warehouseCity.orgUnitId,
        year: 2099,
      },
    });
    const freezeSave = await patchSpec(registrarAuth.token, freezeLotId, buildSpec({ [lotFieldId]: 'Dell' }));
    assert('A5 active inventory freeze → 400', freezeSave.status === 400, String(freezeSave.status));
    await prisma.inventorySession.delete({ where: { id: session.id } });
    cleanupSessionId = null;
  } else {
    console.log('SKIP A5 — warehouse has no orgUnitId for freeze session');
  }

  const issueUniqueSpecs = buildIssueSpecifications(categoryFields, categoryOptionalFields);
  const scopedWarehouse = await prisma.warehouse.findUnique({
    where: { id: scopedWarehouseId },
    select: { orgUnitId: true },
  });
  const issueEmployee = scopedWarehouse?.orgUnitId
    ? await prisma.employee.findFirst({
        where: { orgUnitId: scopedWarehouse.orgUnitId },
        select: { id: true },
      })
    : null;
  if (issueEmployee?.id && Object.keys(issueUniqueSpecs).length > 0) {
    const issueLotId = await createLot(scopedWarehouseId, scopedCategoryId, 'spremno_za_izdavanje');
    await prisma.warehouseStockLot.update({
      where: { id: issueLotId },
      data: {
        specifications: buildSpec({ [lotFieldId]: 'OriginalLot' }),
        status: 'spremno_za_izdavanje',
      },
    });
    const inventoryNumber = `APIV-${randomUUID().slice(0, 8)}`;
    const issueRes = await request('POST', `/stock-lots/${issueLotId}/issue`, adminAuth.token, {
      employeeId: issueEmployee.id,
      inventoryNumber,
      uniqueSpecifications: issueUniqueSpecs,
    });
    if (issueRes.status !== 200 && issueRes.status !== 201) {
      console.log('  A6 issue error:', JSON.stringify(issueRes.json));
    }
    assert('A6 issue → 200', issueRes.status === 200 || issueRes.status === 201, String(issueRes.status));
    const equipment = await prisma.equipment.findFirst({
      where: { inventoryNumber },
      select: { id: true, specifications: true },
    });
    if (equipment) {
      cleanupEquipmentIds.push(equipment.id);
      const specs = equipment.specifications as Record<string, string>;
      assert('A6 issue creates equipment snapshot', specs[lotFieldId] === 'OriginalLot');
      await patchSpec(registrarAuth.token, issueLotId, buildSpec({ [lotFieldId]: 'ChangedAfterIssue' }));
      const equipmentAfter = await prisma.equipment.findUnique({ where: { id: equipment.id } });
      const afterSpecs = (equipmentAfter?.specifications ?? {}) as Record<string, string>;
      assert(
        'A6 lot spec change does not retro-update equipment',
        afterSpecs[lotFieldId] === 'OriginalLot',
        afterSpecs[lotFieldId],
      );
    } else {
      assert('A6 issue equipment row exists', false, `issue status=${issueRes.status}`);
    }
  } else {
    console.log('SKIP A6 — no in-scope employee or category lacks unique issue fields');
  }

  const equipPage = await request('GET', '/equipment?page=1&pageSize=50', adminAuth.token);
  assert('B1 GET /equipment paginated → 200', equipPage.status === 200, `${equipPage.ms}ms`);
  const total = Number((equipPage.json as { meta?: { total?: number } }).meta?.total ?? 0);
  console.log(`  B1 equipment total=${total}, page ms=${equipPage.ms}`);

  const equipSummary = await request('GET', '/equipment/summary', adminAuth.token);
  assert('B2 GET /equipment/summary → 200', equipSummary.status === 200, `${equipSummary.ms}ms`);

  const orgUnits = await request('GET', '/org-units', adminAuth.token);
  const categories = await request('GET', '/categories', adminAuth.token);
  const warehouses = await request('GET', '/warehouses?page=1&pageSize=100', adminAuth.token);
  const bootstrapBytes =
    JSON.stringify(orgUnits.json).length
    + JSON.stringify(categories.json).length
    + JSON.stringify(warehouses.json).length;
  assert('C1 bootstrap reference endpoints → 200', orgUnits.status === 200 && categories.status === 200 && warehouses.status === 200);
  console.log(`  C1 approx bootstrap payload (org+cat+wh page1): ${Math.round(bootstrapBytes / 1024)} KB`);

  const largePage = await request('GET', '/equipment?page=1&pageSize=100', adminAuth.token);
  const pageItems = ((largePage.json as { items?: unknown[] }).items ?? []).length;
  assert(
    'C2 equipment list paginated (items ≤ pageSize)',
    pageItems <= 100,
    `returned ${pageItems} items in ${largePage.ms}ms`,
  );

  if (cleanupSessionId) {
    await prisma.inventorySession.delete({ where: { id: cleanupSessionId } }).catch(() => undefined);
  }
  for (const id of cleanupEquipmentIds) {
    await prisma.transfer.deleteMany({ where: { equipmentId: id } }).catch(() => undefined);
    await prisma.equipment.delete({ where: { id } }).catch(() => undefined);
  }
  for (const id of cleanupLotIds) {
    await prisma.equipment.deleteMany({ where: { stockLotId: id } }).catch(() => undefined);
    await prisma.warehouseStockLot.delete({ where: { id } }).catch(() => undefined);
  }
  if (cleanupWarehouseId) {
    await prisma.warehouseStockLot.deleteMany({ where: { warehouseId: cleanupWarehouseId } }).catch(() => undefined);
    await prisma.warehouse.delete({ where: { id: cleanupWarehouseId } }).catch(() => undefined);
  }
  await prisma.$disconnect();

  const failed = results.filter((row) => !row.ok);
  console.log(`\nAPI verify done: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
};

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
