import assert from 'node:assert/strict';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { describe, it } from 'node:test';
import {
  setUploadRejectLogEnabled,
  uploadRejectRegistry,
} from '../../common/upload/upload-reject.registry';
import { ModeratorScopeService } from '../../common/services/moderator-scope.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { WarehouseTransferTemplateService } from './warehouse-transfer-template.service';

const at = new Date('2026-10-26T23:20:00.000Z');
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const user = (role: string): AuthenticatedUser =>
  ({
    id: 'user-1',
    username: role,
    role,
    employeeId: null,
    registrarScopes: [],
    coordinatorAssignments: [],
    moderatorOrgRoots: [],
    moderatorWarehouseIds: [],
  }) as unknown as AuthenticatedUser;

const file = (overrides: Record<string, unknown> = {}): Express.Multer.File =>
  ({
    mimetype: DOCX_MIME,
    buffer: Buffer.from('not a docx'),
    size: 10,
    originalname: 'template.docx',
    ...overrides,
  }) as unknown as Express.Multer.File;

const createService = (options: { maxMb?: number; orgUnitId?: string | null } = {}) => {
  const prisma = {
    warehouse: {
      findUnique: async () => ({
        orgUnitId: options.orgUnitId === undefined ? 'org-1' : options.orgUnitId,
        isActive: true,
      }),
    },
  } as unknown as PrismaService;
  const configService = {
    get: (_key: string, fallback: string) => fallback,
  } as unknown as ConfigService;
  const settingsService = {
    getNumberValue: async (_key: string, fallback: number): Promise<number> =>
      options.maxMb ?? fallback,
  } as unknown as SettingsService;
  const moderatorScope = {
    assertWarehouseAssigned: async () => undefined,
  } as unknown as ModeratorScopeService;
  return new WarehouseTransferTemplateService(
    prisma,
    configService,
    settingsService,
    moderatorScope,
  );
};

const prepare = (t: { after: (callback: () => void) => void }): void => {
  uploadRejectRegistry.reset(at);
  setUploadRejectLogEnabled(false);
  t.after(() => setUploadRejectLogEnabled(true));
};

describe('WarehouseTransferTemplateService rejection metrics', () => {
  it('records a missing template file', async (t) => {
    prepare(t);
    const service = createService();
    await assert.rejects(
      service.uploadTemplate(
        user('admin'),
        'warehouse-1',
        undefined as unknown as Express.Multer.File,
        'Obrazac',
      ),
      BadRequestException,
    );
    assert.equal(uploadRejectRegistry.snapshot(at).byReason.missing_file, 1);
  });

  it('records an invalid extension or MIME type', async (t) => {
    prepare(t);
    const service = createService();
    await assert.rejects(
      service.uploadTemplate(
        user('admin'),
        'warehouse-1',
        file({ originalname: 'template.pdf', mimetype: 'application/pdf' }),
        'Obrazac',
      ),
      /docx/u,
    );
    assert.equal(uploadRejectRegistry.snapshot(at).byReason.invalid_extension, 1);
  });

  it('records the application-level size limit', async (t) => {
    prepare(t);
    const service = createService({ maxMb: 1 });
    await assert.rejects(
      service.uploadTemplate(
        user('admin'),
        'warehouse-1',
        file({ size: 2 * 1024 * 1024 }),
        'Obrazac',
      ),
      /MB limit/u,
    );
    assert.equal(uploadRejectRegistry.snapshot(at).byReason.size_limit, 1);
  });

  it('records an invalid DOCX template', async (t) => {
    prepare(t);
    const service = createService();
    await assert.rejects(
      service.uploadTemplate(user('admin'), 'warehouse-1', file(), 'Obrazac'),
      BadRequestException,
    );
    assert.equal(uploadRejectRegistry.snapshot(at).byReason.invalid_template, 1);
  });

  it('records a warehouse without an org unit before upload', async (t) => {
    prepare(t);
    const service = createService({ orgUnitId: null });
    await assert.rejects(
      service.uploadTemplate(user('admin'), 'warehouse-1', file(), 'Obrazac'),
      /org\. jedinicu/u,
    );
    assert.equal(uploadRejectRegistry.snapshot(at).byReason.missing_org_unit, 1);
  });

  it('records access denial for a role that cannot manage templates', async (t) => {
    prepare(t);
    const service = createService();
    await assert.rejects(
      service.uploadTemplate(user('user'), 'warehouse-1', file(), 'Obrazac'),
      ForbiddenException,
    );
    assert.equal(uploadRejectRegistry.snapshot(at).byReason.access_denied, 1);
  });
});
