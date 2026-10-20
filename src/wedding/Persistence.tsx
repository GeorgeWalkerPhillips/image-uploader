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
    // Whether this user may keep an offline copy right now: a couple member
    // (membership row), or a status that says partner/collaborator. Anything
    // else (no access at all, or a non-member with no helper status) keeps nothing.
    let allowed = true;
    let purging = false;
    const flush = () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      if (allowed) persist.save(qc, userId);
    };
    const evaluate = () => {
      const membership = qc.getQueryState(['wedding-membership', userId]);
      const status = qc.getQueryState(['wedding-planner-status', userId]);
      const statusAccess = (status?.data as { access?: unknown } | undefined)?.access;
      if (membership?.data) {
        allowed = true;
      } else if (statusAccess === 'partner' || statusAccess === 'collaborator') {
        allowed = true;
      } else if (status?.status === 'success' && status.data !== undefined) {
        // Access was removed (or never existed): forget the copy on disk AND in
        // memory, or the next save would write it back and renew its expiry.
        allowed = false;
        if (!purging) {
          purging = true;
          for (const root of persist.ALLOWED_ROOTS) {
            if (root === 'wedding-membership' || root === 'wedding-planner-status') continue;
            qc.removeQueries({ queryKey: [root] });
          }
          purging = false;
        }
      } else if (membership?.status === 'success') {
        // Not a member and no helper status known: keep nothing.
        allowed = false;
      } else {
        return;
      }
      if (!allowed) {
        if (timer !== null) clearTimeout(timer);
        timer = null;
        persist.clearAll();
      }
    };
    const unsubscribe = qc.getQueryCache().subscribe((event) => {
      if (purging) return;
      evaluate();
      if (!allowed) return;
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
