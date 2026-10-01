/**
 * Timezone-aware date helpers built on Intl (no external dependencies).
 * "Local date" strings are YYYY-MM-DD in a given IANA timezone.
 */

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    partsFormatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const parts = partsFormatter(timeZone).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

/** Offset (ms) of timeZone from UTC at the given instant. */
function offsetMs(instant: Date, timeZone: string): number {
  const p = zonedParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** Convert a wall-clock time in timeZone to a UTC instant (DST-safe). */
export function zonedTimeToUtc(localDate: string, hour: number, timeZone: string): Date {
  const [y, m, d] = localDate.split('-').map(Number) as [number, number, number];
  const guess = Date.UTC(y, m - 1, d, hour, 0, 0);
  let result = guess - offsetMs(new Date(guess), timeZone);
  // Re-check once: across a DST boundary the offset at the result can differ.
  const second = guess - offsetMs(new Date(result), timeZone);
  if (second !== result) result = second;
  return new Date(result);
}

export function localDate(instant: Date, timeZone: string): string {
  const p = zonedParts(instant, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function daysBetween(a: string, b: string): number {
  const toUtc = (s: string) => {
    const [y, m, d] = s.split('-').map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

/** ISO-8601 week key, e.g. "2026-W40", for a local date. */
export function isoWeekKey(date: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dayNum = dt.getUTCDay() || 7; // Monday = 1 … Sunday = 7
  dt.setUTCDate(dt.getUTCDate() + 4 - dayNum); // Thursday decides the ISO year
  const yearStart = Date.UTC(dt.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((dt.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${dt.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Monday (local date) of the ISO week containing date. */
export function startOfIsoWeek(date: string): string {
  const dayNum = (weekdayOf(date) + 6) % 7;
  return addDays(date, -dayNum);
}

export type Frequency = 'daily' | 'weekly' | 'biweekly' | 'monthly';

export interface ScheduleRule {
  frequency: Frequency;
  weekday: number | null;
  dayOfMonth: number | null;
  timezone: string;
  runHour: number;
  startDate: string;
  endDate: string | null;
}

function matchesRule(rule: ScheduleRule, date: string, firstWeeklyMatch: string | null): boolean {
  if (date < rule.startDate) return false;
  switch (rule.frequency) {
    case 'daily':
      return true;
    case 'weekly':
      return weekdayOf(date) === rule.weekday;
    case 'biweekly':
      return (
        weekdayOf(date) === rule.weekday && firstWeeklyMatch !== null && daysBetween(firstWeeklyMatch, date) % 14 === 0
      );
    case 'monthly': {
      const [y, m, d] = date.split('-').map(Number) as [number, number, number];
      const target = Math.min(rule.dayOfMonth ?? 1, daysInMonth(y, m));
      return d === target;
    }
  }
}

function firstWeekdayOnOrAfter(date: string, weekday: number): string {
  const delta = (weekday - weekdayOf(date) + 7) % 7;
  return addDays(date, delta);
}

/**
 * The first occurrence strictly after `after`, or null when the schedule has ended.
 * Returns both the UTC instant and the local date of the occurrence.
 */
export function nextOccurrence(rule: ScheduleRule, after: Date): { at: Date; localDate: string } | null {
  const firstWeekly =
    rule.frequency === 'biweekly' && rule.weekday !== null ? firstWeekdayOnOrAfter(rule.startDate, rule.weekday) : null;
  let cursor = localDate(after, rule.timezone);
  if (cursor < rule.startDate) cursor = rule.startDate;
  else cursor = addDays(cursor, -1); // the occurrence for "today" may still be ahead
  for (let i = 0; i < 800; i++) {
    const date = addDays(cursor, i);
    if (rule.endDate && date > rule.endDate) return null;
    if (!matchesRule(rule, date, firstWeekly)) continue;
    const at = zonedTimeToUtc(date, rule.runHour, rule.timezone);
    if (at.getTime() > after.getTime()) return { at, localDate: date };
  }
  return null;
}

export function addMinutes(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() + minutes * 60_000);
}
