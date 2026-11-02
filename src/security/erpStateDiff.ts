/**
 * Pure helpers for reviewing ERP snapshot changes.
 *
 * This module is intentionally NOT connected to persistence or authorization.
 * It provides deterministic key-level diffing for unit tests and future
 * policy design; it does not enforce permissions or protect Supabase writes.
 */

export type JsonObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** Deep equality for JSON-compatible values; object key order is irrelevant. */
export function jsonValueEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((value, index) => jsonValueEqual(value, right[index]));
  }

  if (isPlainObject(left) || isPlainObject(right)) {
    if (!isPlainObject(left) || !isPlainObject(right)) return false;
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    if (leftKeys.length !== rightKeys.length) return false;
    return leftKeys.every((key, index) =>
      key === rightKeys[index] && jsonValueEqual(left[key], right[key]),
    );
  }

  return false;
}

/**
 * Returns only top-level snapshot keys whose JSON values changed.
 * Missing keys are treated as undefined, so adding/removing a key is detected.
 */
export function getChangedSnapshotKeys(previous: JsonObject, next: JsonObject): string[] {
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  return [...keys].filter((key) => !jsonValueEqual(previous[key], next[key])).sort();
}

/** Flags changed keys that are not yet part of the explicitly reviewed schema. */
export function getUnknownChangedSnapshotKeys(
  changedKeys: readonly string[],
  knownKeys: readonly string[],
): string[] {
  const known = new Set(knownKeys);
  return changedKeys.filter((key) => !known.has(key)).sort();
}
