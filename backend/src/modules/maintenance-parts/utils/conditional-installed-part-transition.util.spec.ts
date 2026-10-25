import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { transitionInstalledPartInTx } from './conditional-installed-part-transition.util';

test('conditionally transitions an installed part from allowed lifecycle states', async () => {
  let args: unknown;
  const tx = {
    equipmentInstalledPart: {
      updateMany: async (input: unknown) => {
        args = input;
        return { count: 1 };
      },
    },
  };
  await transitionInstalledPartInTx(
    tx as never,
    'part-1',
    ['active', 'faulty'],
    { status: 'removed' } as never,
    'not allowed',
  );
  assert.deepEqual(args, {
    where: { id: 'part-1', status: { in: ['active', 'faulty'] } },
    data: { status: 'removed' },
  });
});

test('rejects a stale transition when another request already removed the part', async () => {
  const tx = { equipmentInstalledPart: { updateMany: async () => ({ count: 0 }) } };
  await assert.rejects(
    () =>
      transitionInstalledPartInTx(tx as never, 'part-1', ['active'], { status: 'faulty' } as never, 'Only active parts can be marked faulty'),
    BadRequestException,
  );
});
