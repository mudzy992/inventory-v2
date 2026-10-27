import assert from 'node:assert/strict';
import { BadRequestException } from '@nestjs/common';
import { describe, it } from 'node:test';
import { DocumentJobsService } from '../../modules/documents/document-jobs.service';
import { claimDisposalApprovalReviewInTx } from '../../modules/inventory-count/utils/claim-disposal-approval-review.util';
import { transitionInstalledPartInTx } from '../../modules/maintenance-parts/utils/conditional-installed-part-transition.util';
import { claimTransferForFinalizeInTx } from '../../modules/transfers/utils/claim-transfer-finalize.util';
import { consumeStockLotReceiptFifoInTx } from '../../modules/warehouse-stock/utils/consume-stock-lot-receipt-fifo.util';
import { decrementStockLotOnHandInTx } from '../../modules/warehouse-stock/utils/decrement-stock-lot-on-hand.util';
import type { PrismaService } from '../../prisma/prisma.service';
import { businessTransitionMetricsRegistry } from './business-transition-metrics.registry';

const at = new Date('2026-10-27T12:00:00.000Z');

const counterStore = (counts: number[]) => {
  let index = 0;
  return {
    updateMany: async () => ({ count: counts[Math.min(index++, counts.length - 1)] ?? 0 }),
  };
};

const snapshot = () => businessTransitionMetricsRegistry.snapshot(at);

describe('conditional transition wiring', () => {
  it('records applied and rejected transfer finalize claims', async () => {
    businessTransitionMetricsRegistry.reset(at);
    await claimTransferForFinalizeInTx(
      { transfer: counterStore([1]) } as never,
      'transfer-1',
      { status: 'potpisan' } as never,
    );
    await assert.rejects(
      claimTransferForFinalizeInTx(
        { transfer: counterStore([0]) } as never,
        'transfer-2',
        { status: 'potpisan' } as never,
      ),
      BadRequestException,
    );
    const state = snapshot();
    assert.equal(state.byOperation.transfer_open_status, 2);
    assert.equal(state.applied, 1);
    assert.equal(state.rejected, 1);
    assert.equal(state.byTransition['raw_printed_uploaded->potpisan'], 2);
    assert.equal(state.consecutiveRejections, 1);
  });

  it('records disposal approval review and installed part transitions', async () => {
    businessTransitionMetricsRegistry.reset(at);
    await claimDisposalApprovalReviewInTx(
      { disposalInventoryApproval: counterStore([1]) } as never,
      'approval-1',
      { status: 'approved' } as never,
    );
    await transitionInstalledPartInTx(
      { equipmentInstalledPart: counterStore([1]) } as never,
      'part-1',
      ['active', 'faulty'],
      { status: 'active' } as never,
      'not replaceable',
    );
    await assert.rejects(
      claimDisposalApprovalReviewInTx(
        { disposalInventoryApproval: counterStore([0]) } as never,
        'approval-2',
        { status: 'approved' } as never,
      ),
      BadRequestException,
    );
    const state = snapshot();
    assert.equal(state.intervalTransitions, 3);
    assert.equal(state.byOperation.disposal_approval_review, 2);
    assert.equal(state.byOperation.installed_part_status, 1);
    assert.equal(state.rejected, 1);
  });

  it('records stock lot decrement and FIFO contention retries', async () => {
    businessTransitionMetricsRegistry.reset(at);
    await decrementStockLotOnHandInTx(
      {
        warehouseStockLot: {
          ...counterStore([1, 1]),
          findUnique: async () => ({ id: 'lot-1', status: 'spremno_za_izdavanje' }),
        },
      } as never,
      'lot-1',
    );
    await assert.rejects(
      decrementStockLotOnHandInTx(
        { warehouseStockLot: counterStore([0]) } as never,
        'lot-2',
      ),
      BadRequestException,
    );
    const fifoResult = await consumeStockLotReceiptFifoInTx(
      {
        warehouseStockLotReceipt: {
          ...counterStore([0, 1]),
          findFirst: async () => ({ id: 'receipt-1', entryDate: at, contractNumber: null }),
        },
      } as never,
      'lot-3',
    );
    assert.equal(fifoResult.contractNumber, null);
    const state = snapshot();
    assert.equal(state.byOperation.stock_lot_decrement, 2);
    assert.equal(state.byOperation.stock_lot_fifo_consume, 2);
    assert.equal(state.applied, 2);
    assert.equal(state.rejected, 2);
  });

  it('records DocumentJob running and terminal transitions', async () => {
    businessTransitionMetricsRegistry.reset(at);
    const runningCounter = counterStore([1, 0]);
    const terminalCounter = counterStore([1, 0]);
    const prisma = {
      documentJob: { ...runningCounter, findUnique: async () => null },
      $transaction: async (run: (tx: unknown) => Promise<unknown>) =>
        run({
          documentJob: { ...terminalCounter, findUnique: async () => null },
        }),
    } as unknown as PrismaService;
    const service = new DocumentJobsService(prisma);

    assert.equal(await service.markRunning('job-1'), true);
    assert.equal(await service.markRunning('job-2'), false);
    await service.markFailed('job-3', 'conversion failed', 1, false);
    await service.markFailed('job-4', 'conversion failed', 1, false);

    const state = snapshot();
    assert.equal(state.byOperation.document_job_running, 2);
    assert.equal(state.byOperation.document_job_terminal, 2);
    assert.equal(state.terminalFailed, 1, 'only the applied terminal failure counts');
    assert.equal(state.applied, 2);
    assert.equal(state.rejected, 2);
    assert.ok(!JSON.stringify(state).includes('job-1'));
    assert.ok(!JSON.stringify(state).includes('conversion failed'));
  });

  it('does not leak entity IDs through the registry', () => {
    businessTransitionMetricsRegistry.reset(at);
    businessTransitionMetricsRegistry.recordConditional('transfer_open_status', 1, {
      fromStatus: 'raw',
      toStatus: 'finalized',
      at,
    });
    const json = JSON.stringify(snapshot());
    assert.ok(!json.includes('transfer-1'));
    assert.ok(json.includes('transfer_open_status'));
    businessTransitionMetricsRegistry.reset(at);
  });
});
