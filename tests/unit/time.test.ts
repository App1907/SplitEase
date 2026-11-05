import { describe, expect, it } from 'vitest';
import {
  formatDateInTimeZone,
  isValidDateInput,
  isValidTimeZone,
  parseDateInput,
  zonedStartOfDay,
} from '../../src/common/utils';

describe('time zones', () => {
  it('validates IANA names', () => {
    expect(isValidTimeZone('Asia/Kolkata')).toBe(true);
    expect(isValidTimeZone('America/New_York')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
  });

  it('interprets a date-only value as midnight in the caller time zone', () => {
    expect(zonedStartOfDay('2026-10-28', 'Asia/Kolkata').toISOString()).toBe('2026-10-27T18:30:00.000Z');
    expect(zonedStartOfDay('2026-10-28', 'UTC').toISOString()).toBe('2026-10-28T00:00:00.000Z');
  });

  it('handles daylight saving time', () => {
    // New York is UTC-4 in summer, UTC-5 in winter
    expect(zonedStartOfDay('2026-07-01', 'America/New_York').toISOString()).toBe('2026-07-01T04:00:00.000Z');
    expect(zonedStartOfDay('2026-12-01', 'America/New_York').toISOString()).toBe('2026-12-01T05:00:00.000Z');
  });

  it('makes "to" filters inclusive of the whole day', () => {
    expect(parseDateInput('2026-10-28', 'Asia/Kolkata', true).toISOString()).toBe('2026-10-28T18:29:59.999Z');
  });

  it('keeps full ISO timestamps as-is', () => {
    expect(parseDateInput('2026-10-28T10:00:00Z', 'Asia/Kolkata').toISOString()).toBe(
      '2026-10-28T10:00:00.000Z',
    );
  });

  it('formats an instant as a local calendar date', () => {
    expect(formatDateInTimeZone(new Date('2026-10-27T20:00:00Z'), 'Asia/Kolkata')).toBe('2026-10-28');
    expect(formatDateInTimeZone(new Date('2026-10-27T20:00:00Z'), 'UTC')).toBe('2026-10-27');
  });

  it('rejects impossible or malformed dates', () => {
    expect(isValidDateInput('2026-02-30')).toBe(false);
    expect(isValidDateInput('28-10-2026')).toBe(false);
    expect(isValidDateInput('2026-10-28')).toBe(true);
    expect(isValidDateInput('2026-10-28T10:00:00+05:30')).toBe(true);
  });
});
