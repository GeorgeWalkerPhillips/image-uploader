import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { PageSpinner } from '../components/Spinner';
import * as persist from './lib/persist';
import { useAuthUser } from './useAuthUser';

const SAVE_DELAY_MS = 1000;

// Hydrates the query cache from this user's offline copy before anything
// renders, saves changes back (debounced), and wipes the copy on sign-out, on
// a user change, and when the signed-in user turns out not to be a member.
export function Persistence({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { user, loading } = useAuthUser();
  const userId = user?.id ?? '';
  const [readyFor, setReadyFor] = useState<string | null>(null);
  const previousUser = useRef('');

  useEffect(() => {
    if (loading) return;
    // Signed out or switched account while mounted: drop the previous copy.
    if (previousUser.current && previousUser.current !== userId) {
      persist.clearUser(previousUser.current);
      qc.clear();
    }
    previousUser.current = userId;
    if (!userId) {
      persist.clearAll();
      qc.clear();
      setReadyFor('');
      return;
    }
    persist.clearOthers(userId);
    persist.restore(qc, persist.load(userId));
    setReadyFor(userId);

    let timer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      persist.save(qc, userId);
    };
    const unsubscribe = qc.getQueryCache().subscribe((event) => {
      const q = event.query;
      if (q.queryKey[0] === 'wedding-membership' && q.state.status === 'success' && q.state.data === null) {
        // Signed in but not a member: keep nothing.
        if (timer !== null) clearTimeout(timer);
        timer = null;
        persist.clearAll();
        return;
      }
      if (event.type === 'updated' || event.type === 'added') {
        if (timer === null) timer = setTimeout(flush, SAVE_DELAY_MS);
      }
    });
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);

    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
      if (timer !== null) clearTimeout(timer);
    };
  }, [qc, userId, loading]);

  if (loading || readyFor !== userId) return <PageSpinner />;
  return <>{children}</>;
}
