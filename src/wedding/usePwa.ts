import { useEffect } from 'react';
import { installHqHead, registerHqServiceWorker } from './pwa';
import { showUpdateToast } from './UpdateToast';

// Manifest + service worker for HQ, mounted only once membership is confirmed.
// Production builds only: a worker in `npm start` just gets in the way.
export function usePwa(): void {
  useEffect(() => {
    const restoreHead = installHqHead();
    if (process.env.NODE_ENV === 'production') {
      void registerHqServiceWorker({ onUpdate: (apply) => showUpdateToast(apply) });
    }
    return restoreHead;
  }, []);
}
