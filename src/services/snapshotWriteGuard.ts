import type { Dispatch, SetStateAction } from 'react';

export type SnapshotSyncStatus = 'loading' | 'saving' | 'synced' | 'error';

export function canWriteSnapshot(remoteReady: boolean, syncStatus: SnapshotSyncStatus): boolean {
  return remoteReady && syncStatus === 'synced';
}

export function guardSnapshotSetter<T>(
  setter: Dispatch<SetStateAction<T>>,
  canWrite: () => boolean,
): Dispatch<SetStateAction<T>> {
  return value => {
    if (canWrite()) setter(value);
  };
}
