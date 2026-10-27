import assert from 'node:assert/strict';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { describe, it } from 'node:test';
import {
  setUploadRejectLogEnabled,
  uploadRejectRegistry,
} from '../../common/upload/upload-reject.registry';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { TransfersService } from '../transfers/transfers.service';
import { UploadsService } from './uploads.service';

const at = new Date('2026-10-26T23:10:00.000Z');
const user = {
  id: 'user-1',
  username: 'admin',
  role: 'admin',
  employeeId: null,
  registrarScopes: [],
  coordinatorAssignments: [],
  moderatorOrgRoots: [],
  moderatorWarehouseIds: [],
} as unknown as AuthenticatedUser;

const file = (overrides: Record<string, unknown> = {}): Express.Multer.File =>
  ({
    mimetype: 'application/pdf',
    buffer: Buffer.from('%PDF-1.7 synthetic'),
    size: 16,
    originalname: 'signed.pdf',
    ...overrides,
  }) as unknown as Express.Multer.File;

const createService = (options: { maxMb?: number; documentWarehouseId?: string | null } = {}) => {
  const configService = {
    get: (_key: string, fallback: string) => fallback,
  } as unknown as ConfigService;
  const settingsService = {
    getNumberValue: async (_key: string, fallback: number): Promise<number> =>
      options.maxMb ?? fallback,
  } as unknown as SettingsService;
  const transfersService = {
    findOne: async () => ({
      documentWarehouseId: options.documentWarehouseId ?? null,
      date: new Date('2026-10-26T00:00:00.000Z'),
      documentNumber: 'TR-1',
    }),
  } as unknown as TransfersService;
  const prisma = {} as PrismaService;
  return new UploadsService(prisma, configService, transfersService, settingsService);
};

const prepare = (t: { after: (callback: () => void) => void }): void => {
  uploadRejectRegistry.reset(at);
  setUploadRejectLogEnabled(false);
  t.after(() => setUploadRejectLogEnabled(true));
};

describe('UploadsService rejection metrics', () => {
  it('records a missing signed PDF without touching storage', async (t) => {
    prepare(t);
    const service = createService();
    await assert.rejects(
      service.uploadTransferDocument(user, 'transfer-1', undefined as unknown as Express.Multer.File),
      BadRequestException,
    );
    assert.equal(uploadRejectRegistry.snapshot(at).byReason.missing_file, 1);
  });

  it('records an invalid declared MIME type', async (t) => {
    prepare(t);
    const service = createService();
    await assert.rejects(
      service.uploadTransferDocument(user, 'transfer-1', file({ mimetype: 'text/plain' })),
      /PDF/u,
    );
    assert.equal(uploadRejectRegistry.snapshot(at).byReason.invalid_mime, 1);
  });

  it('records a missing PDF signature', async (t) => {
    prepare(t);
    const service = createService();
    await assert.rejects(
      service.uploadTransferDocument(user, 'transfer-1', file({ buffer: Buffer.from('not pdf') })),
      /validan PDF/u,
    );
    assert.equal(uploadRejectRegistry.snapshot(at).byReason.invalid_signature, 1);
  });

  it('records the application-level size limit', async (t) => {
    prepare(t);
    const service = createService({ maxMb: 1 });
    await assert.rejects(
      service.uploadTransferDocument(
        user,
        'transfer-1',
        file({ size: 2 * 1024 * 1024 }),
      ),
      /MB limit/u,
    );
    assert.equal(uploadRejectRegistry.snapshot(at).byReason.size_limit, 1);
  });

  it('records a transfer without a configured document warehouse', async (t) => {
    prepare(t);
    const service = createService({ documentWarehouseId: null });
    await assert.rejects(
      service.uploadTransferDocument(user, 'transfer-1', file()),
      /document warehouse/u,
    );
    assert.equal(
      uploadRejectRegistry.snapshot(at).byReason.missing_document_warehouse,
      1,
    );
  });
});
