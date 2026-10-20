import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthUser } from '../useAuthUser';
import { statusKey } from '../teamHooks';
import { useOnline } from '../useOnline';
import { requestShellCache } from '../pwa';
import { flushNow, PERSIST_MAX_AGE_MS, readLastSave, writeLastSave } from '../lib/persist';
import { formatLastSaved, helperJobs, partnerJobs, runOfflineSave, summarizeSave } from '../lib/offlineSave';
import type { OfflineResult } from '../lib/offlineSave';
import styles from '../wedding.module.css';
import s from './install.module.css';

const DAYS = PERSIST_MAX_AGE_MS / (24 * 60 * 60 * 1000);

interface Props {
  weddingId: string;
  // A helper only refreshes their own tasks and team names.
  variant: 'partner' | 'helper';
}

type Phase = { kind: 'idle' } | { kind: 'saving'; done: number; total: number } | { kind: 'done'; result: OfflineResult; stored: boolean; appFiles: boolean };

// "Save everything for offline": fetches what the app normally reads, writes
// it to this phone's offline copy right now, and asks the service worker to
// keep the app files. Attachments are never saved.
export function OfflineSaveCard({ weddingId, variant }: Props) {
  const qc = useQueryClient();
  const { user } = useAuthUser();
  const userId = user?.id ?? '';
  const online = useOnline();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [lastSaved, setLastSaved] = useState<number | null>(() => readLastSave(userId));
  const busy = useRef(false);
  const currentUser = useRef(userId);
  currentUser.current = userId;
  const helper = variant === 'helper';

  const save = async () => {
    if (busy.current || !online || !userId) return;
    busy.current = true;
    const jobs = helper ? helperJobs(weddingId, userId) : partnerJobs(weddingId, userId);
    setPhase({ kind: 'saving', done: 0, total: jobs.length });
    try {
      const result = await runOfflineSave(qc, jobs, {
        onProgress: (done, total) => setPhase({ kind: 'saving', done, total }),
      });
      // Signed out, switched account, or lost access while the fetches ran: do
      // not write anything (the sign-out / access wipe must stay final).
      const access = (qc.getQueryData(statusKey(userId)) as { access?: string | null } | undefined)?.access;
      if (currentUser.current !== userId || (access !== 'partner' && access !== 'collaborator')) {
        setPhase({ kind: 'idle' });
        return;
      }
      // Write the copy now instead of waiting for the debounced save.
      const stored = result.saved > 0 && flushNow(qc, userId);
      if (stored) {
        const now = Date.now();
        writeLastSave(userId, undefined, now);
        setLastSaved(now);
      }
      const appFiles = stored ? await requestShellCache() : false;
      setPhase({ kind: 'done', result, stored, appFiles });
    } finally {
      busy.current = false;
    }
  };

  const saving = phase.kind === 'saving';
  const failed = phase.kind === 'done' && (phase.result.failed.length > 0 || !phase.stored);
  const label = helper ? 'Save my tasks for offline' : 'Save everything for offline';

  let status: string | null = null;
  if (phase.kind === 'saving') status = `Saving ${phase.done} of ${phase.total}…`;
  else if (phase.kind === 'done') {
    if (!phase.stored) status = 'Couldn’t keep a copy on this device (storage may be full or blocked). Try again.';
    else status = summarizeSave(phase.result) + (phase.result.failed.length === 0 ? (phase.appFiles ? ' The app files are kept for offline too.' : '') : '');
  }

  return (
    <section className={styles.card} aria-labelledby="hq-offline-heading">
      <h3 id="hq-offline-heading" className={styles.h3}>Use it offline</h3>
      <p className={styles.muted}>
        {helper
          ? 'Keep your assigned tasks on this phone so you can read them without signal.'
          : 'Keep your whole plan on this phone so you can read it without signal. You can view it offline, but changes need a connection.'}
      </p>
      <p className={styles.muted}>Attachments (receipts, PDFs) aren’t saved: they need a connection.</p>
      <div className={styles.actions}>
        <button type="button" className={styles.btnPrimary} onClick={() => void save()} disabled={saving || !online}
          aria-busy={saving}>
          {saving ? 'Saving…' : failed ? 'Try again' : label}
        </button>
      </div>
      {!online && <p className={styles.hint} role="status">You’re offline. Connect to the internet to save a copy.</p>}
      {saving && (
        <div className={s.progress} role="progressbar" aria-label="Saving for offline" aria-valuemin={0}
          aria-valuemax={phase.total} aria-valuenow={phase.done}>
          <span className={s.progressBar} style={{ width: `${phase.total ? (phase.done / phase.total) * 100 : 0}%` }} />
        </div>
      )}
      <p className={failed ? `${styles.muted} ${styles.red}` : styles.muted} role="status" aria-live="polite">{status}</p>
      {lastSaved !== null && (
        <p className={styles.muted}>
          Last saved {formatLastSaved(lastSaved)}. The copy stays on this phone for {DAYS} days; opening the app online refreshes it.
        </p>
      )}
    </section>
  );
}
