import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { CategoriesService } from '../src/modules/categories/categories.service';
import { PrismaService } from '../src/prisma/prisma.service';

const main = async (): Promise<void> => {
  const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
  const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\//u, ''));
  if (
    process.env.NODE_ENV !== 'test' ||
    !['localhost', '127.0.0.1'].includes(databaseUrl.hostname) ||
    databaseName !== 'inventory_ci'
  ) {
    throw new Error('Category reparent race check is restricted to the local inventory_ci test database');
  }

  const prisma = new PrismaService();
  const categoryAId = randomUUID();
  const categoryBId = randomUUID();
  let connected = false;

  try {
    await prisma.$connect();
    connected = true;
    await prisma.category.createMany({
      data: [
        {
          id: categoryAId,
          name: `CI category A ${categoryAId}`,
          description: 'CI concurrent category reparent test',
          fields: [],
          parentId: null,
        },
        {
          id: categoryBId,
          name: `CI category B ${categoryBId}`,
          description: 'CI concurrent category reparent test',
          fields: [],
          parentId: null,
        },
      ],
    });

    const service = new CategoriesService(
      prisma,
      { assertFeatureEnabled: async () => undefined } as never,
    );
    let releaseStart!: () => void;
    const startGate = new Promise<void>((resolve) => {
      releaseStart = resolve;
    });
    let ready = 0;
    const reparent = (id: string, parentId: string) => {
      ready += 1;
      if (ready === 2) releaseStart();
      return startGate.then(() => service.update(id, { parentId }));
    };

    const results = await Promise.allSettled([
      reparent(categoryAId, categoryBId),
      reparent(categoryBId, categoryAId),
    ]);
    const succeeded = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    assert.equal(succeeded.length, 1, 'exactly one concurrent reparent may commit');
    assert.equal(rejected.length, 1, 'the competing reparent must be rejected');
    if (rejected[0]?.status === 'rejected') {
      assert.ok(rejected[0].reason instanceof BadRequestException);
      assert.equal(rejected[0].reason.message, 'Category hierarchy cannot contain a cycle');
    }

    const finalCategories = await prisma.category.findMany({
      where: { id: { in: [categoryAId, categoryBId] } },
      select: { id: true, parentId: true },
    });
    const parentById = new Map(finalCategories.map(({ id, parentId }) => [id, parentId]));
    const isAChildOfB = parentById.get(categoryAId) === categoryBId;
    const isBChildOfA = parentById.get(categoryBId) === categoryAId;
    assert.notEqual(isAChildOfB && isBChildOfA, true, 'the committed tree must not contain a cycle');
    assert.equal(
      Number(isAChildOfB) + Number(isBChildOfA),
      1,
      'one category must be the child and the other must remain the root',
    );

    console.log('Verified PostgreSQL serializes concurrent category reparenting without cycles.');
  } finally {
    try {
      if (connected) {
        await prisma.category.deleteMany({ where: { id: { in: [categoryAId, categoryBId] } } });
      }
    } finally {
      await prisma.$disconnect();
    }
  }
};

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
