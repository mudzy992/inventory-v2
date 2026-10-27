import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import test from 'node:test';
import { BadRequestException, ForbiddenException, StreamableFile } from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { UploadsService } from './uploads.service';

const USER = { id: 'user-1', username: 'u' } as AuthenticatedUser;
const ENTITY_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

interface Harness {
  service: UploadsService;
  calls: string[];
  findManyArgs: unknown[];
  root: string;
  setUpload: (row: Record<string, unknown>) => void;
  cleanup: () => void;
}

const createHarness = (): Harness => {
  const root = mkdtempSync(join(tmpdir(), 'inventory-upload-read-'));
  const calls: string[] = [];
  const findManyArgs: unknown[] = [];
  let upload: Record<string, unknown> = {
    id: 'upload-1',
    entityType: 'transfer',
    entityId: ENTITY_ID,
    path: 'prenosnice/w1/2026/TR-1-signed.pdf',
    mime: 'application/pdf',
    sizeBytes: 12,
  };
  const transfersService = {
    findOne: async (_user: AuthenticatedUser, id: string) => {
      calls.push(`authorize:${id}`);
      return { id };
    },
  };
  const prisma = {
    upload: {
      findUnique: async () => {
        calls.push('findUnique');
        return upload;
      },
      findMany: async (args: unknown) => {
        calls.push('findMany');
        findManyArgs.push(args);
        return [];
      },
    },
  };
  const configService = { get: (_key: string, fallback?: string) => root || fallback };
  const service = new UploadsService(
    prisma as never,
    configService as never,
    transfersService as never,
    {} as never,
  );
  return {
    service,
    calls,
    findManyArgs,
    root,
    setUpload: (row) => {
      upload = row;
    },
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
};

test('findByEntity authorises BEFORE querying and never publishes the internal path', async () => {
  const h = createHarness();
  try {
    await h.service.findByEntity(USER, 'transfer', ENTITY_ID);
    assert.deepEqual(h.calls, [`authorize:${ENTITY_ID}`, 'findMany']);
    const args = h.findManyArgs[0] as { where: unknown; select: Record<string, boolean> };
    assert.deepEqual(args.where, { entityType: 'transfer', entityId: ENTITY_ID });
    assert.equal('path' in args.select, false, 'internal storage paths must not be returned');
    assert.equal(args.select.id, true);
  } finally {
    h.cleanup();
  }
});

test('findByEntity denies entity types that have no read policy (service-level)', async () => {
  for (const entityType of ['equipment', 'other', 'bogus']) {
    const h = createHarness();
    try {
      await assert.rejects(
        h.service.findByEntity(USER, entityType, ENTITY_ID),
        BadRequestException,
      );
      assert.deepEqual(h.calls, [], 'no DB query and no authorizer for an unmapped type');
    } finally {
      h.cleanup();
    }
  }
});

test('getFileStream authorises the owning entity before opening the file', async () => {
  const h = createHarness();
  try {
    const { mkdirSync } = await import('node:fs');
    mkdirSync(join(h.root, 'prenosnice/w1/2026'), { recursive: true });
    writeFileSync(join(h.root, 'prenosnice/w1/2026/TR-1-signed.pdf'), 'PDF-content');
    const result = await h.service.getFileStream(USER, 'upload-1');
    assert.ok(result instanceof StreamableFile);
    (result.getStream() as Readable).destroy();
    assert.deepEqual(h.calls, ['findUnique', `authorize:${ENTITY_ID}`]);
  } finally {
    h.cleanup();
  }
});

test('getFileStream denies uploads of an unauthorised type or without an owner', async () => {
  for (const row of [
    { entityType: 'equipment', entityId: ENTITY_ID },
    { entityType: 'other', entityId: ENTITY_ID },
    { entityType: 'transfer', entityId: null },
  ]) {
    const h = createHarness();
    try {
      h.setUpload({
        id: 'upload-1',
        path: 'prenosnice/w1/2026/TR-1-signed.pdf',
        mime: 'application/pdf',
        ...row,
      });
      await assert.rejects(h.service.getFileStream(USER, 'upload-1'), ForbiddenException);
      assert.equal(h.calls.includes(`authorize:${ENTITY_ID}`), false);
    } finally {
      h.cleanup();
    }
  }
});

test('getFileStream rejects a stored path that escapes the upload root', async () => {
  const h = createHarness();
  try {
    h.setUpload({
      id: 'upload-1',
      entityType: 'transfer',
      entityId: ENTITY_ID,
      path: '../../etc/passwd',
      mime: 'application/pdf',
    });
    await assert.rejects(h.service.getFileStream(USER, 'upload-1'), BadRequestException);
  } finally {
    h.cleanup();
  }
});
