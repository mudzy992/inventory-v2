import assert from 'node:assert/strict';
import test from 'node:test';
import { hasPdfSignature } from './file-signature.util';

test('recognizes a PDF header and rejects client-supplied MIME spoof content', () => {
  assert.equal(hasPdfSignature(Buffer.from('%PDF-1.7\n')), true);
  assert.equal(hasPdfSignature(Buffer.from('<html><script>')), false);
  assert.equal(hasPdfSignature(Buffer.from('%PDF')), false);
});
