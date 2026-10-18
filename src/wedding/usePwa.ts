import { useEffect } from 'react';
import { installHqHead, registerHqServiceWorker } from './pwa';
import { showUpdateToast } from './UpdateToast';

// Manifest + service worker for HQ, mounted only once membership is confirmed.
// Production builds only: a worker in `npm start` just gets in the way.
export function usePwa(): void {
  useEffect(() => {
    const restoreHead = installHqHead();
    let disposeWorker: Promise<() => void> | null = null;
    if (process.env.NODE_ENV === 'production') {
      disposeWorker = registerHqServiceWorker({ onUpdate: (apply) => showUpdateToast(apply) });
    }
    return () => {
      restoreHead();
      void disposeWorker?.then((dispose) => dispose());
    };
  }, []);
}
