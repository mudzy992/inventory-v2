import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { claimDisposalApprovalReviewInTx } from '../src/modules/inventory-count/utils/claim-disposal-approval-review.util';
import { ensureDisposalPendingApproval } from '../src/modules/inventory-count/utils/ensure-disposal-pending-approval.util';
import { PrismaService } from '../src/prisma/prisma.service';

const main = async (): Promise<void> => {
  const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
  const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\//u, ''));
  if (
    process.env.NODE_ENV !== 'test' ||
    !['localhost', '127.0.0.1'].includes(databaseUrl.hostname) ||
    databaseName !== 'inventory_ci'
  ) {
    throw new Error('Disposal approval integration check is restricted to the local inventory_ci test database');
  }

  const prisma = new PrismaService();
  const cantonId = randomUUID();
  const cityId = randomUUID();
  const orgUnitId = randomUUID();
  const categoryId = randomUUID();
  const commissionId = randomUUID();
  const equipmentId = randomUUID();
  const sessionId = randomUUID();
  const nextSessionId = randomUUID();
  const approvalId = randomUUID();
  let connected = false;

  try {
    await prisma.$connect();
    connected = true;
    await prisma.canton.create({
      data: { id: cantonId, name: `CI canton ${cantonId}` },
    });
    await prisma.city.create({
      data: { id: cityId, name: `CI city ${cityId}`, cantonId },
    });
    await prisma.orgUnit.create({
      data: { id: orgUnitId, name: `CI unit ${orgUnitId}`, type: 'direkcija' },
    });
    await prisma.category.create({
      data: {
        id: categoryId,
        name: `CI category ${categoryId}`,
        description: 'CI disposal approval concurrency test',
        fields: [],
      },
    });
    await prisma.disposalCommission.create({
      data: { id: commissionId, cityId, name: `CI commission ${commissionId}` },
    });
    await prisma.equipment.create({
      data: {
        id: equipmentId,
        categoryId,
        specifications: {},
        status: 'skladiste',
        entryDate: new Date('2026-01-01T00:00:00.000Z'),
      },
    });
    await prisma.inventorySession.create({
      data: {
        id: sessionId,
        name: `CI session ${sessionId}`,
        orgUnitId,
        year: 2100,
        status: 'active',
      },
    });
    await prisma.disposalInventoryApproval.create({
      data: { id: approvalId, equipmentId, disposalCommissionId: commissionId, sessionId },
    });

    let enteredTransactions = 0;
    let releaseReviewGate!: () => void;
    const bothTransactionsReady = new Promise<void>((resolve) => {
      releaseReviewGate = resolve;
    });
    const review = (status: 'approved' | 'rejected') =>
      prisma.$transaction(
        async (tx) => {
          enteredTransactions += 1;
          if (enteredTransactions === 2) releaseReviewGate();
          await bothTransactionsReady;
          await claimDisposalApprovalReviewInTx(tx, approvalId, { status });
        },
        { maxWait: 5_000, timeout: 10_000 },
      );

    const results = await Promise.allSettled([review('approved'), review('rejected')]);
    const succeeded = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    assert.equal(succeeded.length, 1, 'exactly one reviewer must claim the pending approval');
    assert.equal(rejected.length, 1, 'the competing reviewer must be rejected');
    if (rejected[0]?.status === 'rejected') {
      assert.ok(
        rejected[0].reason instanceof BadRequestException,
        'the losing review must receive the established already-reviewed response',
      );
      assert.equal(rejected[0].reason.message, 'Approval already reviewed');
    }

    const finalApproval = await prisma.disposalInventoryApproval.findUniqueOrThrow({
      where: { id: approvalId },
    });
    assert.ok(
      finalApproval.status === 'approved' || finalApproval.status === 'rejected',
      'the single winning review must persist a terminal status',
    );

    const retriedApproval = await ensureDisposalPendingApproval(prisma, {
      equipmentId,
      disposalCommissionId: commissionId,
      sessionId,
      inventoryLineId: null,
    });
    assert.equal(
      retriedApproval.status,
      finalApproval.status,
      'retrying the same session action must not reset a reviewed disposal approval',
    );
    assert.equal(retriedApproval.reviewedAt?.getTime(), finalApproval.reviewedAt?.getTime());

    await prisma.inventorySession.create({
      data: {
        id: nextSessionId,
        name: `CI next session ${nextSessionId}`,
        orgUnitId,
        year: 2101,
        status: 'active',
      },
    });
    const nextSessionApproval = await ensureDisposalPendingApproval(prisma, {
      equipmentId,
      disposalCommissionId: commissionId,
      sessionId: nextSessionId,
      inventoryLineId: null,
    });
    assert.equal(nextSessionApproval.sessionId, nextSessionId);
    assert.equal(nextSessionApproval.status, 'pending', 'a new session must still reopen its approval');

    console.log(
      'Verified concurrent disposal review and retry idempotency: same-session retry preserves review, new session reopens approval.',
    );
  } finally {
    try {
      if (connected) {
        await prisma.disposalInventoryApproval.deleteMany({ where: { id: approvalId } });
        await prisma.inventorySession.deleteMany({ where: { id: nextSessionId } });
        await prisma.inventorySession.deleteMany({ where: { id: sessionId } });
        await prisma.disposalCommission.deleteMany({ where: { id: commissionId } });
        await prisma.equipment.deleteMany({ where: { id: equipmentId } });
        await prisma.category.deleteMany({ where: { id: categoryId } });
        await prisma.city.deleteMany({ where: { id: cityId } });
        await prisma.canton.deleteMany({ where: { id: cantonId } });
        await prisma.orgUnit.deleteMany({ where: { id: orgUnitId } });
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
