import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { HttpException } from '@nestjs/common';
import PizZip from 'pizzip';
import { DocumentConversionQueueService } from '../src/modules/documents/document-conversion-queue.service';
import { DocumentJobsService } from '../src/modules/documents/document-jobs.service';
import { TransferDocumentGenerationService } from '../src/modules/transfers/transfer-document-generation.service';
import {
  buildGeneratedDocxRelativePath,
  buildGeneratedPdfRelativePath,
} from '../src/modules/transfers/utils/transfer-document-path.util';
import { PrismaService } from '../src/prisma/prisma.service';

const assertTestDatabase = (): void => {
  const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
  const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\//u, ''));
  if (
    process.env.NODE_ENV !== 'test' ||
    !['localhost', '127.0.0.1'].includes(databaseUrl.hostname) ||
    databaseName !== 'inventory_ci'
  ) {
    throw new Error('Transfer DOCX crash recovery check is restricted to the local inventory_ci test database');
  }
};

const createMinimalTemplate = (): Buffer => {
  const zip = new PizZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    'word/document.xml',
    '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>{broj_prenosnice}</w:t></w:r></w:p><w:sectPr/></w:body></w:document>',
  );
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer;
};

const crashAfterDocxFileWrite = async (
  transferId: string,
  uploadRoot: string,
  templateAbsolutePath: string,
): Promise<never> => {
  assertTestDatabase();
  const prisma = new PrismaService();
  try {
    await prisma.$connect();
    const prismaFacade = {
      transfer: {
        findUnique: prisma.transfer.findUnique.bind(prisma.transfer),
        updateMany: async (args: Parameters<typeof prisma.transfer.updateMany>[0]) => {
          const data = args.data as { generatedDocxPath?: string | null };
          if (data.generatedDocxPath) {
            const generatedAbsolutePath = join(uploadRoot, data.generatedDocxPath);
            assert.ok(existsSync(generatedAbsolutePath), 'DOCX must be on disk before the finalize update');
            process.kill(process.pid, 'SIGKILL');
          }
          return prisma.transfer.updateMany(args);
        },
      },
    };
    const templateService = {
      getActiveTemplate: async () => ({ templatePath: 'ci/template.docx' }),
      resolveTemplateAbsolutePath: () => templateAbsolutePath,
      getUploadRoot: () => uploadRoot,
    };
    const service = new TransferDocumentGenerationService(
      prismaFacade as never,
      { getBooleanValue: async () => false } as never,
      templateService as never,
      {} as never,
      {} as never,
    );
    await service.generateForTransfer(transferId);
    throw new Error('Expected SIGKILL after generated DOCX was written but before DB finalize');
  } finally {
    await prisma.$disconnect();
  }
};

const crashAfterDocxFinalizeBeforePdfEnqueue = async (
  transferId: string,
  uploadRoot: string,
  templateAbsolutePath: string,
): Promise<never> => {
  assertTestDatabase();
  const prisma = new PrismaService();
  await prisma.$connect();
  const documentConversionQueue = {
    enqueuePdfConversion: async () => {
      const transfer = await prisma.transfer.findUniqueOrThrow({
        where: { id: transferId },
        select: { generatedDocxStatus: true, generatedDocxPath: true },
      });
      assert.equal(transfer.generatedDocxStatus, 'done', 'DOCX DB finalize must precede PDF enqueue');
      assert.ok(transfer.generatedDocxPath);
      assert.ok(existsSync(join(uploadRoot, transfer.generatedDocxPath)));
      process.kill(process.pid, 'SIGKILL');
    },
  };
  const templateService = {
    getActiveTemplate: async () => ({ templatePath: 'ci/template.docx' }),
    resolveTemplateAbsolutePath: () => templateAbsolutePath,
    getUploadRoot: () => uploadRoot,
  };
  const service = new TransferDocumentGenerationService(
    prisma,
    { getBooleanValue: async () => true } as never,
    templateService as never,
    documentConversionQueue as never,
    {} as never,
  );
  await service.reconcileQueuedDocxGenerations();
  throw new Error('Expected SIGKILL after DOCX finalize but before PDF enqueue');
};

const main = async (): Promise<void> => {
  assertTestDatabase();
  const prisma = new PrismaService();
  const cantonId = randomUUID();
  const cityId = randomUUID();
  const orgUnitId = randomUUID();
  const warehouseId = randomUUID();
  const categoryId = randomUUID();
  const equipmentId = randomUUID();
  const signerId = randomUUID();
  const transferId = randomUUID();
  const documentNumber = `CI-DOCX-${transferId.slice(0, 8)}`;
  const tempDirectory = mkdtempSync(join(tmpdir(), 'inventory-transfer-docx-'));
  const templateAbsolutePath = join(tempDirectory, 'template.docx');
  const generatedRelativePath = buildGeneratedDocxRelativePath(
    warehouseId,
    new Date('2026-01-01T00:00:00.000Z').getFullYear(),
    documentNumber,
  );
  const generatedAbsolutePath = join(tempDirectory, generatedRelativePath);
  let connected = false;

  try {
    mkdirSync(resolve(templateAbsolutePath, '..'), { recursive: true });
    writeFileSync(templateAbsolutePath, createMinimalTemplate());
    await prisma.$connect();
    connected = true;

    await prisma.canton.create({
      data: { id: cantonId, name: `CI DOCX canton ${cantonId}` },
    });
    await prisma.city.create({
      data: { id: cityId, name: `CI DOCX city ${cityId}`, cantonId },
    });
    await prisma.orgUnit.create({
      data: { id: orgUnitId, name: `CI DOCX org ${orgUnitId}`, type: 'direkcija' },
    });
    await prisma.warehouse.create({
      data: {
        id: warehouseId,
        name: `CI DOCX warehouse ${warehouseId}`,
        cityId,
        address: 'CI test address',
      },
    });
    await prisma.category.create({
      data: {
        id: categoryId,
        name: `CI DOCX category ${categoryId}`,
        description: 'Transfer DOCX crash recovery test',
        fields: [],
      },
    });
    await prisma.employee.create({
      data: {
        id: signerId,
        firstName: 'CI',
        lastName: 'Signer',
        title: 'Test signer',
        orgUnitId,
      },
    });
    await prisma.equipment.create({
      data: {
        id: equipmentId,
        categoryId,
        specifications: {},
        status: 'skladiste',
        inventoryNumber: `CI-${equipmentId}`,
        entryDate: new Date('2026-01-01T00:00:00.000Z'),
        warehouseId,
      },
    });
    await prisma.transfer.create({
      data: {
        id: transferId,
        equipmentId,
        type: 'zaduzenje',
        fromType: 'skladiste',
        fromWarehouseId: warehouseId,
        toType: 'rashod',
        signerId,
        date: new Date('2026-01-01T00:00:00.000Z'),
        status: 'raw',
        documentNumber,
        documentWarehouseId: warehouseId,
        generatedDocxStatus: 'queued',
      },
    });

    const killedWorker = spawnSync(
      process.execPath,
      ['--import', 'tsx', resolve(process.cwd(), 'prisma/check-transfer-docx-crash-recovery.ts')],
      {
        env: {
          ...process.env,
          TRANSFER_DOCX_CRASH_PHASE: 'after-file-write-before-finalize',
          TRANSFER_DOCX_CRASH_ID: transferId,
          TRANSFER_DOCX_UPLOAD_ROOT: tempDirectory,
          TRANSFER_DOCX_TEMPLATE_PATH: templateAbsolutePath,
        },
        encoding: 'utf8',
        timeout: 30_000,
      },
    );
    assert.equal(killedWorker.signal, 'SIGKILL', 'worker must be killed after file write and before DB finalize');
    assert.ok(existsSync(generatedAbsolutePath), 'generated DOCX side effect must precede the process crash');

    const afterCrash = await prisma.transfer.findUniqueOrThrow({
      where: { id: transferId },
      select: {
        generatedDocxStatus: true,
        generatedDocxAttempts: true,
        generatedDocxPath: true,
        generatedDocxLeaseToken: true,
        generatedDocxLeaseUntil: true,
      },
    });
    assert.equal(afterCrash.generatedDocxStatus, 'running');
    assert.equal(afterCrash.generatedDocxAttempts, 1);
    assert.equal(afterCrash.generatedDocxPath, null, 'DB finalize must not have happened before the crash');
    assert.ok(afterCrash.generatedDocxLeaseToken);
    assert.ok(afterCrash.generatedDocxLeaseUntil);

    await prisma.transfer.update({
      where: { id: transferId },
      data: { generatedDocxLeaseUntil: new Date(Date.now() - 1_000) },
    });
    const recoveredWorker = spawnSync(
      process.execPath,
      ['--import', 'tsx', resolve(process.cwd(), 'prisma/check-transfer-docx-crash-recovery.ts')],
      {
        env: {
          ...process.env,
          TRANSFER_DOCX_CRASH_PHASE: 'after-finalize-before-pdf-enqueue',
          TRANSFER_DOCX_CRASH_ID: transferId,
          TRANSFER_DOCX_UPLOAD_ROOT: tempDirectory,
          TRANSFER_DOCX_TEMPLATE_PATH: templateAbsolutePath,
        },
        encoding: 'utf8',
        timeout: 30_000,
      },
    );
    assert.equal(
      recoveredWorker.signal,
      'SIGKILL',
      'reconciler must be killed after DOCX finalize and before PDF enqueue',
    );

    const recovered = await prisma.transfer.findUniqueOrThrow({
      where: { id: transferId },
      select: {
        generatedDocxStatus: true,
        generatedDocxAttempts: true,
        generatedDocxPath: true,
        generatedDocxLeaseToken: true,
        generatedDocxLeaseUntil: true,
        generatedDocxError: true,
        generatedPdfPath: true,
      },
    });
    assert.equal(recovered.generatedDocxStatus, 'done');
    assert.equal(recovered.generatedDocxAttempts, 2, 'lease takeover must count as a second attempt');
    assert.equal(recovered.generatedDocxPath, generatedRelativePath);
    assert.equal(recovered.generatedDocxLeaseToken, null);
    assert.equal(recovered.generatedDocxLeaseUntil, null);
    assert.equal(recovered.generatedDocxError, null);
    assert.equal(recovered.generatedPdfPath, null);
    const generatedZip = new PizZip(readFileSync(generatedAbsolutePath));
    const documentXml = generatedZip.file('word/document.xml')?.asText() ?? '';
    assert.ok(documentXml.includes(documentNumber), 'recovered DOCX must contain the transfer document number');

    const documentJobs = new DocumentJobsService(prisma);
    assert.equal(
      await prisma.documentJob.count({ where: { sourceType: 'transfer', sourceId: transferId } }),
      0,
      'crash after DOCX finalize must leave no PDF DocumentJob to reconcile',
    );
    const expectedPdfRelativePath = buildGeneratedPdfRelativePath(
      warehouseId,
      new Date('2026-01-01T00:00:00.000Z').getFullYear(),
      documentNumber,
    );
    let queueAddCount = 0;
    const capturedQueueAdd: { payload?: Record<string, unknown> } = {};
    const fakeBullQueue = {
      add: async (
        _jobName: string,
        payload: Record<string, unknown>,
        options: { jobId?: string },
      ) => {
        queueAddCount += 1;
        capturedQueueAdd.payload = payload;
        return { id: options.jobId };
      },
    };
    const conversionQueue = new DocumentConversionQueueService(fakeBullQueue as never, documentJobs);
    const pdfRetryService = new TransferDocumentGenerationService(
      prisma,
      {} as never,
      { getUploadRoot: () => tempDirectory } as never,
      conversionQueue,
      documentJobs as never,
    );
    await assert.rejects(
      pdfRetryService.getGeneratedFileStream(transferId, 'pdf'),
      (error: unknown) => error instanceof HttpException && error.getStatus() === 409,
      'PDF request should report processing while it recreates the missing conversion job',
    );

    const enqueuedDocumentJob = await documentJobs.findLatestForSource('transfer', transferId);
    assert.equal(queueAddCount, 1, 'PDF retry must add a BullMQ job when DB has no PDF job');
    assert.ok(enqueuedDocumentJob);
    assert.equal(enqueuedDocumentJob.status, 'queued');
    assert.equal(enqueuedDocumentJob.sourceRelativePath, generatedRelativePath);
    assert.equal(enqueuedDocumentJob.resultRelativePath, expectedPdfRelativePath);
    assert.equal(enqueuedDocumentJob.bullJobId, enqueuedDocumentJob.id);
    assert.equal(capturedQueueAdd.payload?.sourceRelativePath, generatedRelativePath);
    assert.equal(capturedQueueAdd.payload?.resultRelativePath, expectedPdfRelativePath);

    console.log(
      'Verified DOCX recovery and PDF retry after process death both after DOCX file write and after DB finalize.',
    );
  } finally {
    try {
      if (connected) {
        await prisma.documentJob.deleteMany({ where: { sourceType: 'transfer', sourceId: transferId } });
        await prisma.transfer.deleteMany({ where: { id: transferId } });
        await prisma.equipment.deleteMany({ where: { id: equipmentId } });
        await prisma.employee.deleteMany({ where: { id: signerId } });
        await prisma.category.deleteMany({ where: { id: categoryId } });
        await prisma.warehouse.deleteMany({ where: { id: warehouseId } });
        await prisma.orgUnit.deleteMany({ where: { id: orgUnitId } });
        await prisma.city.deleteMany({ where: { id: cityId } });
        await prisma.canton.deleteMany({ where: { id: cantonId } });
      }
    } finally {
      rmSync(tempDirectory, { recursive: true, force: true });
      await prisma.$disconnect();
    }
  }
};

const crashPhase = process.env.TRANSFER_DOCX_CRASH_PHASE;
const crashTransferId = process.env.TRANSFER_DOCX_CRASH_ID;
const crashUploadRoot = process.env.TRANSFER_DOCX_UPLOAD_ROOT;
const crashTemplatePath = process.env.TRANSFER_DOCX_TEMPLATE_PATH;
if (crashPhase && crashTransferId && crashUploadRoot && crashTemplatePath) {
  const crashWorker =
    crashPhase === 'after-file-write-before-finalize'
      ? crashAfterDocxFileWrite(crashTransferId, crashUploadRoot, crashTemplatePath)
      : crashPhase === 'after-finalize-before-pdf-enqueue'
        ? crashAfterDocxFinalizeBeforePdfEnqueue(crashTransferId, crashUploadRoot, crashTemplatePath)
        : Promise.reject(new Error(`Unknown transfer DOCX crash phase: ${crashPhase}`));
  void crashWorker.catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
} else {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
