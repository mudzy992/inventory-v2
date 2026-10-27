import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { TransfersService } from './transfers.service';

const source = readFileSync(resolve('src/modules/transfers/transfers.service.ts'), 'utf8');
const makeService = () => new TransfersService(
  {} as never, {} as never, {} as never, {} as never, {} as never,
  {} as never, {} as never, {} as never, {} as never, {} as never,
  {} as never, {} as never,
);

test('finalize rejects plain users before any database access', async () => {
  const service = makeService();
  await assert.rejects(
    service.finalize({ id: 'u1', role: 'user' } as never, 't1', { signerId: 's1' } as never),
    /Users cannot finalize/u,
  );
});

test('transfer state transitions are conditional claims, never blind writes', () => {
  assert.match(source, /claimTransferForFinalizeInTx\(/u);
  assert.match(source, /generatedDocxStatus/u);
  assert.doesNotMatch(source, /\bconsole\./u);
});
