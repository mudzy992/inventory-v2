import assert from 'node:assert/strict';
import { parseEquipmentQr } from './parse-qr.ts';

const uuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

assert.deepEqual(parseEquipmentQr(`https://evidens.ba101.top/equipment/${uuid}`), {
  kind: 'uuid',
  value: uuid,
});
assert.deepEqual(parseEquipmentQr(`INVENTAR:INV-1|${uuid}`), { kind: 'search', value: 'INV-1' });
assert.deepEqual(parseEquipmentQr(uuid), { kind: 'uuid', value: uuid });
assert.deepEqual(parseEquipmentQr('  INV-9  '), { kind: 'search', value: 'INV-9' });

console.log('parse-qr ok');
