import { useEffect } from 'react';
import { installHqHead, registerHqServiceWorker } from './pwa';
import { showUpdateToast } from './UpdateToast';
import { ensureInstallCapture } from './installStore';

// Manifest + service worker for HQ, mounted only once membership is confirmed.
// Production builds only: a worker in `npm start` just gets in the way.
export function usePwa(): void {
  useEffect(() => {
    // Listen for the browser's install prompt before the manifest below can make it fire.
    ensureInstallCapture();
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
