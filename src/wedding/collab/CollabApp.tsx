import { Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { FaTasks, FaSignOutAlt } from 'react-icons/fa';
import type { IconType } from 'react-icons';
import { PageSpinner } from '../../components/Spinner';
import { Shell } from '../Shell';
import { useAuthUser } from '../useAuthUser';
import { useSignOut } from '../useSignOut';
import { useCollabWedding, usePlannerStatus } from '../teamHooks';
import { formatDateJhb } from '../lib/time';
import { CollabTasks } from './CollabTasks';
import styles from '../wedding.module.css';

function Glyph({ icon }: { icon: IconType }) {
  return <>{icon({ 'aria-hidden': true })}</>;
}

// The helper's separate, minimal app. The route table is explicit: the home
// screen and nothing else, so no couple page can be reached from here (the
// database would refuse the data anyway). Unknown paths go back to the home screen.
// Realtime is deliberately not started for helpers: the couple's channel
// subscribes to tables a helper cannot read, so they refresh when they return
// to the app, and with the Refresh button.
export function CollabApp() {
  const { user } = useAuthUser();
  const userId = user?.id ?? '';
  const status = usePlannerStatus(userId, true);
  const wedding = useCollabWedding(userId);
  const signOut = useSignOut();

  const weddingId = status.data?.wedding_id ?? null;
  if (!weddingId) return <PageSpinner />;

  const date = wedding.data?.wedding_date ? formatDateJhb(wedding.data.wedding_date) : null;
  const title = wedding.data?.name ?? 'Your tasks';
  const subtitle = wedding.isError && !wedding.data
    ? 'Could not load the wedding details.'
    : [date, 'You are helping with this wedding'].filter(Boolean).join(' · ');

  const nav = (
    <nav className={styles.tabs} aria-label="Wedding HQ helper">
      <NavLink to="/hq/" end className={({ isActive }) => `${styles.tab} ${isActive ? styles.tabActive : ''}`}>
        <Glyph icon={FaTasks} />
        <span>My tasks</span>
      </NavLink>
      <button type="button" className={`${styles.tab} ${styles.tabButton}`} onClick={() => void signOut()}>
        <Glyph icon={FaSignOutAlt} />
        <span>Sign out</span>
      </button>
    </nav>
  );

  return (
    <Shell title={title} subtitle={subtitle} homeTo="/hq/" homeLabel="Wedding HQ home" nav={nav}>
      <Routes>
        <Route index element={<CollabTasks weddingId={weddingId} />} />
        <Route path="*" element={<Navigate to="/hq/" replace />} />
      </Routes>
    </Shell>
  );
}
