import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';
import { InternalServerErrorException } from '@nestjs/common';
import { resolveGeneratedDocumentPath } from './resolve-generated-document-path.util';

const assertRejectedPath = (uploadRoot: string, storedPath: string): void => {
  assert.throws(
    () => resolveGeneratedDocumentPath(uploadRoot, storedPath),
    (error: unknown) => error instanceof InternalServerErrorException,
  );
};

test('resolves generated document paths below the upload root', () => {
  const uploadRoot = join('/srv', 'inventory', 'uploads');
  assert.equal(
    resolveGeneratedDocumentPath(uploadRoot, 'prenosnice/warehouse/2026/TR-1.pdf'),
    join(uploadRoot, 'prenosnice', 'warehouse', '2026', 'TR-1.pdf'),
  );
});

test('rejects absolute, parent-traversal and malformed generated document paths', () => {
  const uploadRoot = join('/srv', 'inventory', 'uploads');
  assertRejectedPath(uploadRoot, '/etc/passwd');
  assertRejectedPath(uploadRoot, '../private.pdf');
  assertRejectedPath(uploadRoot, 'prenosnice/../../private.pdf');
  assertRejectedPath(uploadRoot, '.');
  assertRejectedPath(uploadRoot, 'prenosnice\0/TR-1.pdf');
  assertRejectedPath(uploadRoot, '');
});
