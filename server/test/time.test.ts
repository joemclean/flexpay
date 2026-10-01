import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isoWeekKey, localDate, nextOccurrence, zonedTimeToUtc, type ScheduleRule } from '../src/lib/time.js';

const rule = (r: Partial<ScheduleRule>): ScheduleRule => ({
  frequency: 'weekly',
  weekday: 6,
  dayOfMonth: null,
  timezone: 'America/New_York',
  runHour: 8,
  startDate: '2026-01-01',
  endDate: null,
  ...r,
});

describe('zonedTimeToUtc', () => {
  it('converts wall-clock time in standard and daylight time', () => {
    assert.equal(zonedTimeToUtc('2026-01-15', 8, 'America/New_York').toISOString(), '2026-01-15T13:00:00.000Z');
    assert.equal(zonedTimeToUtc('2026-07-15', 8, 'America/New_York').toISOString(), '2026-07-15T12:00:00.000Z');
  });

  it('handles the day DST starts', () => {
    // 2026-03-08: clocks jump 02:00 → 03:00 in New York.
    assert.equal(zonedTimeToUtc('2026-03-08', 8, 'America/New_York').toISOString(), '2026-03-08T12:00:00.000Z');
    assert.equal(zonedTimeToUtc('2026-03-07', 8, 'America/New_York').toISOString(), '2026-03-07T13:00:00.000Z');
  });

  it('round-trips through localDate', () => {
    const at = zonedTimeToUtc('2026-10-31', 23, 'Australia/Sydney');
    assert.equal(localDate(at, 'Australia/Sydney'), '2026-10-31');
  });
});

describe('isoWeekKey', () => {
  it('follows ISO-8601 year boundaries', () => {
    assert.equal(isoWeekKey('2026-01-01'), '2026-W01');
    assert.equal(isoWeekKey('2026-12-31'), '2026-W53');
    assert.equal(isoWeekKey('2027-01-03'), '2026-W53');
    assert.equal(isoWeekKey('2027-01-04'), '2027-W01');
    assert.equal(isoWeekKey('2026-10-01'), '2026-W40');
  });
});

describe('nextOccurrence', () => {
  it('finds the next weekly run on the right weekday and hour', () => {
    const next = nextOccurrence(rule({ weekday: 6 }), new Date('2026-10-01T15:00:00Z')); // Thursday
    assert.equal(next?.localDate, '2026-10-03');
    assert.equal(next?.at.toISOString(), '2026-10-03T12:00:00.000Z');
  });

  it('includes later today when the run hour has not passed yet', () => {
    const next = nextOccurrence(rule({ frequency: 'daily', weekday: null }), new Date('2026-10-01T10:00:00Z')); // 06:00 local
    assert.equal(next?.localDate, '2026-10-01');
  });

  it('skips to tomorrow once today’s run hour has passed', () => {
    const next = nextOccurrence(rule({ frequency: 'daily', weekday: null }), new Date('2026-10-01T13:00:00Z')); // 09:00 local
    assert.equal(next?.localDate, '2026-10-02');
  });

  it('keeps biweekly runs on a 14-day cadence from the first match', () => {
    const r = rule({ frequency: 'biweekly', weekday: 5, startDate: '2026-09-01' }); // first Friday: 2026-09-04
    const first = nextOccurrence(r, new Date('2026-09-01T00:00:00Z'));
    assert.equal(first?.localDate, '2026-09-04');
    const second = nextOccurrence(r, first!.at);
    assert.equal(second?.localDate, '2026-09-18');
  });

  it('clamps monthly runs to the end of short months', () => {
    const r = rule({ frequency: 'monthly', weekday: null, dayOfMonth: 31 });
    const feb = nextOccurrence(r, new Date('2026-02-01T00:00:00Z'));
    assert.equal(feb?.localDate, '2026-02-28');
    const mar = nextOccurrence(r, feb!.at);
    assert.equal(mar?.localDate, '2026-03-31');
  });

  it('returns null after the end date', () => {
    const r = rule({ frequency: 'daily', weekday: null, endDate: '2026-10-02' });
    assert.equal(nextOccurrence(r, new Date('2026-10-02T13:00:00Z')), null);
  });

  it('never starts before the start date', () => {
    const r = rule({ frequency: 'daily', weekday: null, startDate: '2026-11-01' });
    assert.equal(nextOccurrence(r, new Date('2026-10-01T00:00:00Z'))?.localDate, '2026-11-01');
  });
});
