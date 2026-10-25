import assert from 'node:assert/strict';
import test from 'node:test';
import { iterateCursorPages } from './cursor-pages.util';

test('iterateCursorPages follows the last item in each page and stops on a short page', async () => {
  const pages = new Map<string | undefined, Array<{ id: string }>>([
    [undefined, [{ id: 'a' }, { id: 'b' }]],
    ['b', [{ id: 'c' }]],
  ]);
  const calls: Array<{ cursorId: string | undefined; take: number }> = [];

  const result: string[] = [];
  for await (const item of iterateCursorPages(async (cursorId, take) => {
    calls.push({ cursorId, take });
    return pages.get(cursorId) ?? [];
  }, 2)) {
    result.push(item.id);
  }

  assert.deepEqual(result, ['a', 'b', 'c']);
  assert.deepEqual(calls, [
    { cursorId: undefined, take: 2 },
    { cursorId: 'b', take: 2 },
  ]);
});

test('iterateCursorPages stops on an empty first page', async () => {
  let calls = 0;
  const result: string[] = [];

  for await (const item of iterateCursorPages(async (): Promise<Array<{ id: string }>> => {
    calls += 1;
    return [];
  }, 2)) {
    result.push(item.id);
  }

  assert.deepEqual(result, []);
  assert.equal(calls, 1);
});

test('iterateCursorPages validates the page size and loader result', async () => {
  await assert.rejects(async () => {
    for await (const _item of iterateCursorPages(async (): Promise<Array<{ id: string }>> => [], 0)) {
      void _item;
    }
  }, RangeError);

  await assert.rejects(async () => {
    for await (const _item of iterateCursorPages(
      async (): Promise<Array<{ id: string }>> => [{ id: 'a' }, { id: 'b' }],
      1,
    )) {
      void _item;
    }
  }, /more rows than requested/u);
});
