import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  UPLOAD_READABLE_ENTITY_TYPES,
  isReadableUploadEntityType,
  requireAuthorizableStoredUpload,
  requireReadableUploadEntityType,
  resolveUploadAbsolutePath,
} from './upload-access-policy.util';

const ROOT = resolve('/srv/app/uploads');

test('only entity types with a registered authorizer are readable', () => {
  assert.deepEqual(UPLOAD_READABLE_ENTITY_TYPES, ['transfer']);
  assert.equal(isReadableUploadEntityType('transfer'), true);
  for (const bad of ['equipment', 'other', '', null, undefined, 1, {}, 'TRANSFER', 'transfer ']) {
    assert.equal(isReadableUploadEntityType(bad), false, `${String(bad)} must not be readable`);
    assert.throws(() => requireReadableUploadEntityType(bad), BadRequestException);
  }
  assert.equal(requireReadableUploadEntityType('transfer'), 'transfer');
});

test('a stored upload without entityId or with an unmapped type is denied', () => {
  assert.deepEqual(requireAuthorizableStoredUpload('transfer', 'tr-1'), {
    type: 'transfer',
    entityId: 'tr-1',
  });
  assert.throws(() => requireAuthorizableStoredUpload('transfer', null), ForbiddenException);
  assert.throws(() => requireAuthorizableStoredUpload('transfer', ''), ForbiddenException);
  for (const type of ['equipment', 'other', 'unknown', null]) {
    assert.throws(() => requireAuthorizableStoredUpload(type, 'tr-1'), ForbiddenException);
  }
});

test('generated relative paths resolve inside the upload root', () => {
  const relative = 'prenosnice/w1/2026/TR-1-uid-signed.pdf';
  assert.equal(resolveUploadAbsolutePath(ROOT, relative), join(ROOT, relative));
});

test('path traversal, absolute paths, drive prefixes and NUL bytes are rejected', () => {
  const payloads = [
    '../secret.pdf',
    'prenosnice/../../secret.pdf',
    '../../etc/passwd',
    '/etc/passwd',
    'C:\\Windows\\system32\\config',
    'prenosnice\\..\\secret.pdf',
    'prenosnice/ok\u0000.pdf',
    '',
    '.',
    '..',
  ];
  for (const payload of payloads) {
    assert.throws(
      () => resolveUploadAbsolutePath(ROOT, payload),
      BadRequestException,
      `payload ${JSON.stringify(payload)} must be rejected`,
    );
  }
});

test('a sibling directory with the same prefix is not considered inside the root', () => {
  // `resolve()` collapses `uploads-evil/..` back to the real root, but a
  // crafted path that lands in the sibling must still be rejected.
  assert.throws(
    () => resolveUploadAbsolutePath(ROOT, '../uploads-evil/secret.pdf'),
    BadRequestException,
  );
  assert.equal(
    resolveUploadAbsolutePath(ROOT, 'prenosnice/./2026/file.pdf'),
    join(ROOT, 'prenosnice/2026/file.pdf'),
  );
});
