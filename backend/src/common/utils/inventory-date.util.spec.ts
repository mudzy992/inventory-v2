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

  it('keeps the business date correct through DST transitions and the year boundary', () => {
    const zone = 'Europe/Sarajevo';
    const springBefore = getZonedCalendarParts(new Date('2026-03-29T00:59:00.000Z'), zone);
    const springAfter = getZonedCalendarParts(new Date('2026-03-29T01:00:00.000Z'), zone);
    assert.deepEqual(springBefore, { year: 2026, month: 3, day: 29 });
    assert.deepEqual(springAfter, springBefore);

    const fallBefore = getZonedCalendarParts(new Date('2026-10-25T00:59:00.000Z'), zone);
    const fallAfter = getZonedCalendarParts(new Date('2026-10-25T01:00:00.000Z'), zone);
    assert.deepEqual(fallBefore, { year: 2026, month: 10, day: 25 });
    assert.deepEqual(fallAfter, fallBefore);

    assert.deepEqual(
      getZonedCalendarParts(new Date('2026-12-31T23:00:00.000Z'), zone),
      { year: 2027, month: 1, day: 1 },
    );
  });

  it('rejects an invalid IANA timezone', () => {
    assert.throws(
      () => getZonedCalendarParts(new Date('2026-01-01T00:00:00.000Z'), 'Invalid/Timezone'),
      RangeError,
    );
  });
});
