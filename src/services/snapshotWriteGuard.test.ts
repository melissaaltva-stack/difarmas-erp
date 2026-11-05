import { describe, expect, it, vi } from 'vitest';
import { canWriteSnapshot, guardSnapshotSetter } from './snapshotWriteGuard';

describe('snapshotWriteGuard', () => {
  it('allows snapshot changes only when remote state is ready and synced', () => {
    expect(canWriteSnapshot(false, 'synced')).toBe(false);
    expect(canWriteSnapshot(true, 'loading')).toBe(false);
    expect(canWriteSnapshot(true, 'saving')).toBe(false);
    expect(canWriteSnapshot(true, 'error')).toBe(false);
    expect(canWriteSnapshot(true, 'synced')).toBe(true);
  });

  it('blocks direct values and updater functions when writes are not allowed', () => {
    const setter = vi.fn();
    const guarded = guardSnapshotSetter(setter, false);
    guarded(['local-only']);
    guarded(current => [...current, 'local-only']);
    expect(setter).not.toHaveBeenCalled();
  });

  it('forwards values and updater functions when writes are allowed', () => {
    const setter = vi.fn();
    const guarded = guardSnapshotSetter(setter, true);
    const next = ['accepted'];
    const updater = (current: string[]) => [...current, 'next'];
    guarded(next);
    guarded(updater);
    expect(setter).toHaveBeenNthCalledWith(1, next);
    expect(setter).toHaveBeenNthCalledWith(2, updater);
  });
});
