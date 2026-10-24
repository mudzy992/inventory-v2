import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateInventorySessionDto } from '../../modules/inventory-count/dto/create-inventory-session.dto';
import { ManageInventoryCommitteeDto } from '../../modules/inventory-count/dto/manage-inventory-committee.dto';
import { RecordInventoryLineDto } from '../../modules/inventory-count/dto/record-inventory-line.dto';
import { RecordWarehouseInventoryLineDto } from '../../modules/inventory-count/dto/record-warehouse-inventory-line.dto';
import { ReviewDisposalApprovalDto } from '../../modules/inventory-count/dto/review-disposal-approval.dto';
import { UpdateMaintenancePartNoteDto } from '../../modules/maintenance-parts/dto/update-maintenance-part-note.dto';
import { UpdateSettingDto } from '../../modules/settings/dto/update-setting.dto';

const validatePayload = async <T extends object>(
  type: new () => T,
  payload: unknown,
) => validate(plainToInstance(type, payload), { whitelist: true, forbidNonWhitelisted: true });

test('setting values accept only bounded primitive values and reject extra keys', async () => {
  for (const value of ['text', 5, true]) {
    assert.equal((await validatePayload(UpdateSettingDto, { value })).length, 0);
  }
  for (const value of [{ nested: true }, null, Number.NaN, 'x'.repeat(10_001)]) {
    assert.notEqual((await validatePayload(UpdateSettingDto, { value })).length, 0);
  }
  assert.notEqual((await validatePayload(UpdateSettingDto, { value: 'x', extra: true })).length, 0);
});

test('inventory write DTOs validate scalar, nested, enum, and numeric fields', async () => {
  assert.equal(
    (
      await validatePayload(CreateInventorySessionDto, {
        name: '2026 inventory',
        orgUnitId: 'org-1',
        year: 2026,
      })
    ).length,
    0,
  );
  assert.notEqual(
    (
      await validatePayload(ManageInventoryCommitteeDto, {
        warehouseId: 'wh-1',
        categoryId: 'cat-1',
        inventoryMembers: [{ employeeId: 'emp-1', role: 'invalid' }],
        disposalMembers: [],
      })
    ).length,
    0,
  );
  assert.notEqual(
    (await validatePayload(RecordInventoryLineDto, { equipmentId: 'eq-1', status: 'unknown' })).length,
    0,
  );
  assert.notEqual(
    (
      await validatePayload(RecordWarehouseInventoryLineDto, {
        stockLotId: 'lot-1',
        status: 'prisutna',
        quantityCounted: -1,
      })
    ).length,
    0,
  );
  assert.notEqual(
    (await validatePayload(ReviewDisposalApprovalDto, { approved: 'true' })).length,
    0,
  );
});

test('optional maintenance notes must be bounded strings', async () => {
  assert.equal((await validatePayload(UpdateMaintenancePartNoteDto, { note: 'checked' })).length, 0);
  assert.notEqual((await validatePayload(UpdateMaintenancePartNoteDto, { note: 10 })).length, 0);
  assert.notEqual(
    (await validatePayload(UpdateMaintenancePartNoteDto, { note: 'x'.repeat(1001) })).length,
    0,
  );
});
