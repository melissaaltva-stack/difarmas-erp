import { describe, expect, it } from 'vitest';
import {
  getChangedSnapshotKeys,
  getUnknownChangedSnapshotKeys,
  jsonValueEqual,
} from './erpStateDiff';

describe('jsonValueEqual', () => {
  it('treats object key order as irrelevant', () => {
    expect(jsonValueEqual({ a: 1, b: { c: 2 } }, { b: { c: 2 }, a: 1 })).toBe(true);
  });

  it('detects array order and nested value changes', () => {
    expect(jsonValueEqual([{ id: 1 }, { id: 2 }], [{ id: 2 }, { id: 1 }])).toBe(false);
    expect(jsonValueEqual({ rows: [{ amount: 10 }] }, { rows: [{ amount: 11 }] })).toBe(false);
  });

  it('distinguishes null, missing-like undefined, and primitive values', () => {
    expect(jsonValueEqual(null, undefined)).toBe(false);
    expect(jsonValueEqual(1, '1')).toBe(false);
  });
});

describe('getChangedSnapshotKeys', () => {
  it('returns no changed keys for equivalent full snapshots', () => {
    expect(getChangedSnapshotKeys(
      { customers: [], products: [], settings: { a: 1, b: 2 } },
      { settings: { b: 2, a: 1 }, products: [], customers: [] },
    )).toEqual([]);
  });

  it('returns only keys whose values changed', () => {
    expect(getChangedSnapshotKeys(
      { customers: [], products: [{ id: 1, stock: 5 }], quotes: [] },
      { customers: [], products: [{ id: 1, stock: 4 }], quotes: [{ id: 9 }] },
    )).toEqual(['products', 'quotes']);
  });

  it('detects added and removed top-level keys', () => {
    expect(getChangedSnapshotKeys(
      { customers: [], legacyField: true },
      { customers: [], quotes: [] },
    )).toEqual(['legacyField', 'quotes']);
  });
});

describe('getUnknownChangedSnapshotKeys', () => {
  it('flags only changed keys outside the reviewed schema', () => {
    expect(getUnknownChangedSnapshotKeys(
      ['products', 'futureModule', 'legacyField'],
      ['products', 'customers', 'quotes'],
    )).toEqual(['futureModule', 'legacyField']);
  });

  it('does not flag a known key', () => {
    expect(getUnknownChangedSnapshotKeys(['quotes'], ['quotes', 'products'])).toEqual([]);
  });
});
