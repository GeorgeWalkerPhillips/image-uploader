import { useEffect, useState } from 'react';

export const isOnline = (): boolean => typeof navigator === 'undefined' || navigator.onLine !== false;

// Tracks the browser's online/offline state.
export function useOnline(): boolean {
  const [online, setOnline] = useState(isOnline);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    setOnline(isOnline());
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}

export const OFFLINE_WRITE_MESSAGE = "You're offline. Changes can't be saved until you're back online.";

// Writes are never queued: while offline they fail straight away, honestly.
export function assertOnline(): void {
  if (!isOnline()) throw new Error(OFFLINE_WRITE_MESSAGE);
}
