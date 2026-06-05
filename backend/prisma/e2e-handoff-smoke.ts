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
): Promise<{ status: number; json: Json }> => {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await response.json().catch(() => ({}))) as Json;
  return { status: response.status, json };
};

const assert = (label: string, ok: boolean, detail?: string): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) {
    process.exitCode = 1;
  }
};

const main = async (): Promise<void> => {
  const credentials = [
    { username: 'admin', password: 'admin123' },
    { username: 'adnan.sarajlic', password: 'admin123' },
    { username: 'mudzahid', password: 'admin123' },
  ];
  let token = '';
  for (const cred of credentials) {
    const attempt = await request('POST', '/auth/login', undefined, cred);
    if (attempt.status === 200 || attempt.status === 201) {
      token = String((attempt.json as { accessToken?: string }).accessToken ?? '');
      console.log(`Logged in as ${cred.username}`);
      break;
    }
  }
  assert('login', token.length > 10);

  const patchOff = async (key: string, enabled: boolean): Promise<void> => {
    const res = await request('PATCH', `/settings/${key}`, token, { value: enabled });
    assert(`patch ${key}=${enabled}`, res.status === 200, String(res.status));
  };

  await patchOff('features.inventory_count', false);
  const invOff = await request('GET', '/inventory-sessions', token);
  assert('inventory-sessions off → 400', invOff.status === 400, String(invOff.status));
  await patchOff('features.inventory_count', true);

  await patchOff('features.disposal_commissions', false);
  const dispOff = await request('GET', '/disposal-commissions', token);
  assert('disposal-commissions off → 400', dispOff.status === 400, String(dispOff.status));
  await patchOff('features.disposal_commissions', true);

  const prisma = createPrismaClient();
  const ssd = await prisma.category.findFirst({
    where: { name: 'SSD', categoryKind: 'MAINTENANCE' },
    select: { id: true, name: true },
  });
  const host = await prisma.category.findFirst({
    where: { name: { contains: 'stanica' }, categoryKind: 'ASSET' },
    select: { id: true, name: true },
  });
  const printerHost = await prisma.category.findFirst({
    where: { name: 'Printeri', categoryKind: 'ASSET' },
    select: { id: true, name: true },
  });
  const monitorHost = await prisma.category.findFirst({
    where: { name: { contains: 'onitor' }, categoryKind: 'ASSET' },
    select: { id: true, name: true },
  });
  const warehouse = await prisma.warehouse.findFirst({ select: { id: true, name: true } });
  const workstationEquipment = host
    ? await prisma.equipment.findFirst({
        where: { categoryId: host.id },
        select: { id: true, inventoryNumber: true },
      })
    : null;
  const monitorEquipment = monitorHost
    ? await prisma.equipment.findFirst({
        where: { categoryId: monitorHost.id },
        select: { id: true },
      })
    : null;

  assert('SSD category', Boolean(ssd?.id));
  assert('host Radna stanica', Boolean(host?.id));
  assert('warehouse', Boolean(warehouse?.id));

  if (ssd?.id && warehouse?.id) {
    const receive = await request(
      'POST',
      `/maintenance-parts/warehouses/${warehouse.id}/stock-lots`,
      token,
      {
        categoryId: ssd.id,
        productName: 'SSD smoke test',
        quantity: 10,
        entryDate: new Date().toISOString().slice(0, 10),
      },
    );
    assert('receive SSD lot', receive.status === 201 || receive.status === 200, String(receive.status));
    const lotId = String((receive.json as { id?: string }).id ?? '');
    if (workstationEquipment?.id && lotId) {
      const before = await prisma.warehouseStockLot.findUnique({
        where: { id: lotId },
        select: { quantityOnHand: true },
      });
      const install = await request(
        'POST',
        `/maintenance-parts/equipment/${workstationEquipment.id}/install`,
        token,
        { stockLotId: lotId, quantity: 1 },
      );
      assert('install SSD on workstation', install.status === 201 || install.status === 200, String(install.status));
      const after = await prisma.warehouseStockLot.findUnique({
        where: { id: lotId },
        select: { quantityOnHand: true },
      });
      if (before && after) {
        assert('lot qty decreased', after.quantityOnHand === before.quantityOnHand - 1);
      }
    }
    const summary = await request(
      'GET',
      `/maintenance-parts/warehouses/${warehouse.id}/consumption-summary?hostCategoryId=${host?.id ?? ''}`,
      token,
    );
    assert('consumption summary', summary.status === 200, String(summary.status));
  }

  if (monitorEquipment?.id) {
    const parts = await request('GET', `/maintenance-parts/equipment/${monitorEquipment.id}/parts`, token);
    const list = (parts.json as unknown[]) ?? [];
    assert('monitor has no installed parts panel data', parts.status === 200 && list.length === 0);
  }

  if (printerHost?.id) {
    const links = await prisma.categoryMaintenanceLink.findMany({
      where: { hostCategoryId: printerHost.id },
      include: { maintenanceCategory: true },
    });
    const names = links.map((row) => row.maintenanceCategory.name).join(', ');
    assert('printer host links include toner/stampac', /štampa|toner|TK/i.test(names), names);
  }

  const linkedHosts = await request('GET', '/maintenance-parts/linked-host-categories', token);
  assert('linked-host-categories', linkedHosts.status === 200, String(linkedHosts.status));

  await prisma.$disconnect();
  console.log('\nSmoke done.');
};

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
