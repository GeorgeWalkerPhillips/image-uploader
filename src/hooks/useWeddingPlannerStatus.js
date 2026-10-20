import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { getPlannerStatus, NO_PLANNER_STATUS } from '../services/weddingPlannerService';

// Small per-user cache so the nav, the landing page and /wedding-planner
// share one lookup. Imports only the tiny service — never src/wedding/.
const cache = new Map(); // userId -> status
const inflight = new Map(); // userId -> Promise<status>

const load = (userId, force) => {
  if (!force && cache.has(userId)) return Promise.resolve(cache.get(userId));
  if (!force && inflight.has(userId)) return inflight.get(userId);
  const p = getPlannerStatus()
    .then((s) => {
      cache.set(userId, s);
      return s;
    })
    .finally(() => inflight.delete(userId));
  inflight.set(userId, p);
  return p;
};

export const clearPlannerStatusCache = () => {
  cache.clear();
  inflight.clear();
};

export const hasPlannerAccess = (status) => !!status && (status.entitled || !!status.access);

// Never throws, never blocks rendering. `loading` is true only while a real
// signed-in user's status is being fetched.
export function useWeddingPlannerStatus() {
  const { user } = useAuth();
  const userId = user && !user.is_anonymous ? user.id : null;
  const [state, setState] = useState(() => ({
    userId,
    status: userId && cache.has(userId) ? cache.get(userId) : NO_PLANNER_STATUS,
    loading: !!userId && !cache.has(userId),
  }));

  useEffect(() => {
    let cancelled = false;
    if (!userId) {
      setState({ userId: null, status: NO_PLANNER_STATUS, loading: false });
      return undefined;
    }
    setState({
      userId,
      status: cache.has(userId) ? cache.get(userId) : NO_PLANNER_STATUS,
      loading: !cache.has(userId),
    });
    load(userId, false).then((status) => {
      if (!cancelled) setState({ userId, status, loading: false });
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const refresh = useCallback(async () => {
    if (!userId) return NO_PLANNER_STATUS;
    const status = await load(userId, true);
    setState({ userId, status, loading: false });
    return status;
  }, [userId]);

  // Guard against a stale status from a previous user for one render.
  const current = state.userId === userId;
  return {
    status: current ? state.status : NO_PLANNER_STATUS,
    loading: userId ? (current ? state.loading : true) : false,
    refresh,
  };
}
