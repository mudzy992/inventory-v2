/**
 * Faza C — API bypass smoke (FE guard zaobiđen, BE mora vratiti 400/403 + BS poruku).
 * Pokretanje: SMOKE_API_BASE=http://localhost:3000/backend tsx prisma/guard-audit-smoke.ts
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { createPrismaClient } from '../src/prisma/create-prisma-client';

config({ path: resolve(__dirname, '../../.env') });

const API = process.env.SMOKE_API_BASE ?? 'http://localhost:3000/backend';

type Json = Record<string, unknown>;

const request = async (
  method: string,
  path: string,
  token?: string,
  body?: Json,
): Promise<{ status: number; json: Json; text: string }> => {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json: Json = {};
  try {
    json = JSON.parse(text) as Json;
  } catch {
    json = { raw: text };
  }
  return { status: response.status, json, text };
};

const getMessage = (json: Json): string => {
  const msg = json.message;
  if (typeof msg === 'string') {
    return msg;
  }
  if (Array.isArray(msg)) {
    return msg.join(' ');
  }
  return String(json.raw ?? '');
};

const assert = (label: string, ok: boolean, detail?: string): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) {
    process.exitCode = 1;
  }
};

const login = async (): Promise<string> => {
  const credentials = [
    { username: 'admin', password: 'admin123' },
    { username: 'adnan.sarajlic', password: 'admin123' },
  ];
  for (const cred of credentials) {
    const attempt = await request('POST', '/auth/login', undefined, cred);
    if (attempt.status === 200 || attempt.status === 201) {
      const token = String((attempt.json as { accessToken?: string }).accessToken ?? '');
      if (token.length > 10) {
        console.log(`Logged in as ${cred.username}`);
        return token;
      }
    }
  }
  return '';
};

const patchSetting = async (token: string, key: string, value: boolean): Promise<boolean> => {
  const res = await request('PATCH', `/settings/${key}`, token, { value });
  return res.status === 200;
};

const main = async (): Promise<void> => {
  const token = await login();
  assert('login', token.length > 10);
  if (!token) {
    return;
  }

  const prisma = createPrismaClient();

  const employeeWithUser = await prisma.employee.findFirst({
    where: { user: { isNot: null } },
    select: { id: true, firstName: true, lastName: true },
  });
  if (employeeWithUser) {
    const del = await request('DELETE', `/employees/${employeeWithUser.id}`, token);
    const msg = getMessage(del.json);
    assert(
      'employees DELETE with user account → 400 + BS',
      del.status === 400 && /korisnički račun/i.test(msg),
      `${del.status}: ${msg.slice(0, 80)}`,
    );
  } else {
    console.log('SKIP employees DELETE — no employee with user account in DB');
  }

  const catalogInUse = await prisma.equipmentCatalogItem.findFirst({
    where: { equipment: { some: {} } },
    select: { id: true, name: true, _count: { select: { equipment: true } } },
  });
  if (catalogInUse && catalogInUse._count.equipment > 0) {
    const del = await request('DELETE', `/equipment-catalog/${catalogInUse.id}`, token);
    const msg = getMessage(del.json);
    assert(
      'catalog DELETE in use → 400 + BS',
      del.status === 400 && /u upotrebi/i.test(msg),
      `${del.status}: ${msg.slice(0, 80)}`,
    );
  } else {
    console.log('SKIP catalog DELETE — no in-use catalog item in DB');
  }

  const equipment = await prisma.equipment.findFirst({
    where: { status: { in: ['skladiste', 'zaduzeno'] } },
    select: { id: true, status: true, currentHolderId: true, warehouseId: true },
  });
  if (equipment) {
    const rashod = await request('POST', '/transfers', token, {
      equipmentId: equipment.id,
      type: 'rashodovanje',
      fromType: equipment.status === 'zaduzeno' ? 'person' : 'warehouse',
      fromPersonId: equipment.status === 'zaduzeno' ? equipment.currentHolderId : undefined,
      toType: 'rashod',
      reason: 'smoke bypass',
    });
    const rashodMsg = getMessage(rashod.json);
    assert(
      'transfers rashodovanje → 400 + BS',
      rashod.status === 400 && /liste za rashod/i.test(rashodMsg),
      `${rashod.status}: ${rashodMsg.slice(0, 80)}`,
    );

    const genWasOn = await patchSetting(token, 'transfer.generation.enabled', false);
    if (genWasOn) {
      const zad = await request('POST', '/transfers', token, {
        equipmentId: equipment.id,
        type: 'zaduzenje',
        fromType: 'warehouse',
        toType: 'person',
        toPersonId: equipment.currentHolderId ?? undefined,
        warehouseId: equipment.warehouseId ?? undefined,
      });
      const zadMsg = getMessage(zad.json);
      assert(
        'transfers zaduzenje when generation off → 400 + BS',
        zad.status === 400 && /isključeno/i.test(zadMsg),
        `${zad.status}: ${zadMsg.slice(0, 80)}`,
      );
      await patchSetting(token, 'transfer.generation.enabled', true);
    } else {
      console.log('SKIP transfer generation off — could not patch setting');
    }
  } else {
    console.log('SKIP transfers — no suitable equipment in DB');
  }

  const closedLot = await prisma.warehouseStockLot.findFirst({
    where: { status: 'zatvoreno' },
    select: { id: true },
  });
  if (closedLot) {
    const spec = await request('PATCH', `/warehouse-stock/stock-lots/${closedLot.id}/specifications`, token, {
      specifications: { note: 'smoke' },
    });
    const specMsg = getMessage(spec.json);
    assert(
      'registrar stock spec on closed lot → 400',
      spec.status === 400,
      `${spec.status}: ${specMsg.slice(0, 80)}`,
    );
  } else {
    console.log('SKIP closed lot spec — no zatvoreno lot in DB');
  }

  const relocationLine = await prisma.employeeRelocationLine.findFirst({
    where: {
      status: { in: ['pending_source', 'rejected'] },
      equipment: { catalogItemId: null, stockLot: { catalogItemId: null } },
    },
    select: { id: true },
  });
  if (relocationLine) {
    const rel = await request('POST', `/employee-relocation/lines/${relocationLine.id}/resolve-source`, token, {
      action: 'transfer',
    });
    const relMsg = getMessage(rel.json);
    assert(
      'relocation transfer without catalog → 400 + BS',
      rel.status === 400 && /šifrarnik/i.test(relMsg),
      `${rel.status}: ${relMsg.slice(0, 80)}`,
    );
  } else {
    console.log('SKIP relocation — no pending line without catalog in DB');
  }

  await prisma.$disconnect();
  console.log('\nGuard audit API smoke done.');
};

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
