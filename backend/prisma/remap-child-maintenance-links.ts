import { config } from 'dotenv';
import { resolve } from 'node:path';
import { createPrismaClient } from '../src/prisma/create-prisma-client';

config({ path: resolve(__dirname, '../../.env') });

const normalize = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim();

const PRINTER_HOST_HINTS = ['printer', 'stampac', 'stampa'];
const WORKSTATION_HOST_HINTS = ['radn', 'laptop', 'racunar', 'pc', 'desktop', 'stanic'];
const MONITOR_HOST_HINTS = ['monitor'];

const PRINTER_MAINT_HINTS = ['toner', 'stampac', 'stampa', 'cartridge'];
const WORKSTATION_MAINT_HINTS = ['dijel', 'perifer', 'ssd', 'hdd', 'ram', 'memor', 'disk'];

const matchesAny = (name: string, hints: string[]): boolean => {
  const n = normalize(name);
  return hints.some((hint) => n.includes(hint));
};

const classifyHostChild = (name: string): 'printer' | 'monitor' | 'workstation' => {
  if (matchesAny(name, MONITOR_HOST_HINTS)) {
    return 'monitor';
  }
  if (matchesAny(name, PRINTER_HOST_HINTS)) {
    return 'printer';
  }
  if (matchesAny(name, WORKSTATION_HOST_HINTS)) {
    return 'workstation';
  }
  return 'workstation';
};

const classifyMaintenanceTarget = (
  maintenanceName: string,
  maintenanceAncestors: string[],
): 'printer' | 'workstation' | 'both' => {
  const chain = [maintenanceName, ...maintenanceAncestors].join(' ');
  if (matchesAny(chain, PRINTER_MAINT_HINTS)) {
    return 'printer';
  }
  if (matchesAny(chain, WORKSTATION_MAINT_HINTS)) {
    return 'workstation';
  }
  return 'both';
};

const main = async (): Promise<void> => {
  const prisma = createPrismaClient();
  await prisma.$connect();
  const categories = await prisma.category.findMany({
    select: { id: true, name: true, parentId: true, categoryKind: true },
  });
  const childrenByParent = new Map<string, string[]>();
  for (const row of categories) {
    if (!row.parentId) {
      continue;
    }
    const list = childrenByParent.get(row.parentId) ?? [];
    list.push(row.id);
    childrenByParent.set(row.parentId, list);
  }
  const categoryById = new Map(categories.map((row) => [row.id, row]));
  const isLeaf = (id: string): boolean => !(childrenByParent.get(id)?.length);
  const ancestorNames = (id: string): string[] => {
    const names: string[] = [];
    let current = categoryById.get(id);
    while (current?.parentId) {
      const parent = categoryById.get(current.parentId);
      if (!parent) {
        break;
      }
      names.push(parent.name);
      current = parent;
    }
    return names;
  };
  const links = await prisma.categoryMaintenanceLink.findMany({
    include: {
      hostCategory: { select: { id: true, name: true, categoryKind: true } },
      maintenanceCategory: { select: { id: true, name: true, categoryKind: true } },
    },
  });
  console.log('--- Current links ---');
  for (const link of links) {
    const hostLeaf = isLeaf(link.hostCategoryId);
    console.log(
      `${link.hostCategory.name} (${hostLeaf ? 'leaf' : 'NON-LEAF'}) <- ${link.maintenanceCategory.name}`,
    );
  }
  const invalidHostLinks = links.filter((link) => !isLeaf(link.hostCategoryId));
  if (invalidHostLinks.length === 0) {
    console.log('\nNo parent (non-leaf) host links to remap.');
    await prisma.$disconnect();
    return;
  }
  const toCreate = new Map<string, Set<string>>();
  const toDeleteLinkIds: string[] = [];
  for (const link of invalidHostLinks) {
    toDeleteLinkIds.push(link.id);
    const childIds = childrenByParent.get(link.hostCategoryId) ?? [];
    const childHosts = childIds
      .map((id) => categoryById.get(id))
      .filter((row): row is NonNullable<typeof row> => Boolean(row));
    const maintTarget = classifyMaintenanceTarget(
      link.maintenanceCategory.name,
      ancestorNames(link.maintenanceCategoryId),
    );
    for (const child of childHosts) {
      if (!isLeaf(child.id)) {
        continue;
      }
      const hostKind = classifyHostChild(child.name);
      if (hostKind === 'monitor') {
        continue;
      }
      const accept =
        maintTarget === 'both' ||
        (maintTarget === 'printer' && hostKind === 'printer') ||
        (maintTarget === 'workstation' && hostKind === 'workstation');
      if (!accept) {
        continue;
      }
      const set = toCreate.get(child.id) ?? new Set<string>();
      set.add(link.maintenanceCategoryId);
      toCreate.set(child.id, set);
    }
  }
  const existingPairs = new Set(
    links.map((row) => `${row.hostCategoryId}:${row.maintenanceCategoryId}`),
  );
  await prisma.$transaction(async (tx) => {
    if (toDeleteLinkIds.length > 0) {
      await tx.categoryMaintenanceLink.deleteMany({ where: { id: { in: toDeleteLinkIds } } });
    }
    for (const [hostId, maintIds] of toCreate) {
      for (const maintenanceCategoryId of maintIds) {
        const key = `${hostId}:${maintenanceCategoryId}`;
        if (existingPairs.has(key)) {
          continue;
        }
        await tx.categoryMaintenanceLink.create({
          data: { hostCategoryId: hostId, maintenanceCategoryId },
        });
        existingPairs.add(key);
        const host = categoryById.get(hostId);
        const maint = categoryById.get(maintenanceCategoryId);
        console.log(`+ ${host?.name} <- ${maint?.name}`);
      }
    }
  });
  const parentAssignments = await prisma.registrarAssignment.findMany({
    where: {
      categoryId: { in: invalidHostLinks.map((row) => row.hostCategoryId) },
    },
    include: { category: true, warehouse: true },
  });
  for (const assignment of parentAssignments) {
    const childIds = childrenByParent.get(assignment.categoryId) ?? [];
    const workstationChild = childIds
      .map((id) => categoryById.get(id))
      .find((row) => row && isLeaf(row.id) && classifyHostChild(row.name) === 'workstation');
    if (!workstationChild) {
      console.log(
        `! Registrar assignment kept on parent ${assignment.category.name} (no workstation child found)`,
      );
      continue;
    }
    const duplicate = await prisma.registrarAssignment.findFirst({
      where: {
        userId: assignment.userId,
        warehouseId: assignment.warehouseId,
        categoryId: workstationChild.id,
      },
    });
    if (!duplicate) {
      await prisma.registrarAssignment.create({
        data: {
          userId: assignment.userId,
          warehouseId: assignment.warehouseId,
          categoryId: workstationChild.id,
        },
      });
      console.log(
        `+ Registrar: ${assignment.warehouse?.name ?? assignment.warehouseId} + ${workstationChild.name}`,
      );
    }
    await prisma.registrarAssignment.delete({ where: { id: assignment.id } });
    console.log(`- Registrar parent: ${assignment.category.name}`);
  }
  console.log('\nRemap finished.');
  await prisma.$disconnect();
};

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
