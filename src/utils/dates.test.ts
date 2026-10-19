import { describe, expect, it } from 'vitest';
import { dateKey, isValidDateOnly, localDateKey } from './dates';

describe('date utilities', () => {
  it('validates real calendar dates and rejects impossible dates', () => {
    expect(isValidDateOnly('2026-10-19')).toBe(true);
    expect(isValidDateOnly('2027-02-29')).toBe(false);
    expect(isValidDateOnly('2026-02-31')).toBe(false);
    expect(isValidDateOnly('2026-2-03')).toBe(false);
  });

  it('preserves date-only calendar values without UTC conversion', () => {
    expect(dateKey('2026-10-12')).toBe('2026-10-12');
  });

  it('uses the local calendar day for timestamps', () => {
    const timestamp = new Date(2026, 9, 12, 15, 30).toISOString();
    expect(dateKey(timestamp)).toBe(localDateKey(new Date(2026, 9, 12, 15, 30)));
  });

  it('falls back to the date prefix for invalid values', () => {
    expect(dateKey('invalid-date-value')).toBe('invalid-da');
  });
});
