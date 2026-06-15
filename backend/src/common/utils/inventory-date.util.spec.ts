import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  compareMonthDay,
  getZonedCalendarParts,
  isOnOrAfterMonthDay,
  parseMonthDay,
} from './inventory-date.util';

describe('inventory-date.util', () => {
  it('parses MM-DD', () => {
    assert.deepEqual(parseMonthDay('11-30'), { month: 11, day: 30 });
  });

  it('compares month-day values', () => {
    assert.ok(isOnOrAfterMonthDay({ month: 12, day: 1 }, { month: 11, day: 30 }));
    assert.equal(isOnOrAfterMonthDay({ month: 11, day: 29 }, { month: 11, day: 30 }), false);
    assert.equal(compareMonthDay({ month: 12, day: 1 }, { month: 11, day: 30 }), 1);
  });

  it('resolves zoned calendar parts', () => {
    const parts = getZonedCalendarParts(new Date('2026-11-30T22:00:00.000Z'), 'Europe/Sarajevo');
    assert.equal(parts.year, 2026);
    assert.equal(parts.month, 11);
    assert.equal(parts.day, 30);
  });
});
