import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListUploadsQueryDto } from './list-uploads-query.dto';

const UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

const errorsFor = async (payload: unknown): Promise<number> =>
  (
    await validate(plainToInstance(ListUploadsQueryDto, payload), {
      whitelist: true,
      forbidNonWhitelisted: true,
    })
  ).length;

test('valid transfer + UUID query passes the global ValidationPipe rules', async () => {
  assert.equal(await errorsFor({ entityType: 'transfer', entityId: UUID }), 0);
});

test('entity types without a read policy are rejected at the boundary', async () => {
  for (const entityType of ['equipment', 'other', '', 'TRANSFER', 'transfer ', 1, null]) {
    assert.notEqual(
      await errorsFor({ entityType, entityId: UUID }),
      0,
      `entityType ${String(entityType)} must be rejected`,
    );
  }
  assert.notEqual(await errorsFor({ entityId: UUID }), 0, 'entityType is required');
});

test('entityId must be a UUID and is mandatory', async () => {
  for (const entityId of ['', 'not-a-uuid', '123', null, 42, UUID + 'x']) {
    assert.notEqual(await errorsFor({ entityType: 'transfer', entityId }), 0);
  }
  assert.notEqual(await errorsFor({ entityType: 'transfer' }), 0);
});

test('extra query parameters are rejected by forbidNonWhitelisted', async () => {
  assert.notEqual(
    await errorsFor({ entityType: 'transfer', entityId: UUID, path: '../../etc/passwd' }),
    0,
  );
});
