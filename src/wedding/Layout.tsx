import type { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { FaHome, FaWallet, FaTasks, FaCalendarAlt, FaEllipsisH } from 'react-icons/fa';
import type { IconType } from 'react-icons';
import styles from './wedding.module.css';

// react-icons 5 returns ReactNode, which TS 4.9 rejects as a JSX element type;
// calling the icon and wrapping it in a fragment keeps strict typing intact.
function Glyph({ icon }: { icon: IconType }) {
  return <>{icon({ 'aria-hidden': true })}</>;
}

interface Tab {
  to: string;
  label: string;
  Icon: IconType;
  end?: boolean;
}

const TABS: readonly Tab[] = [
  { to: '/hq', label: 'Home', Icon: FaHome, end: true },
  { to: '/hq/budget', label: 'Budget', Icon: FaWallet },
  { to: '/hq/tasks', label: 'Tasks', Icon: FaTasks },
  { to: '/hq/calendar', label: 'Calendar', Icon: FaCalendarAlt },
];

const NON_MORE = ['/hq', '/hq/budget', '/hq/tasks', '/hq/calendar'];

export function Layout({ children }: { children: ReactNode }) {
  const path = useLocation().pathname.replace(/\/+$/, '') || '/';
  const moreActive = !NON_MORE.some((p) => path === p || (p !== '/hq' && path.startsWith(`${p}/`)));

  return (
    <div className={styles.root}>
      <main className={styles.container}>{children}</main>
      <nav className={styles.tabs} aria-label="Wedding HQ">
        {TABS.map(({ to, label, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => `${styles.tab} ${isActive ? styles.tabActive : ''}`}
          >
            <Glyph icon={Icon} />
            <span>{label}</span>
          </NavLink>
        ))}
        <NavLink
          to="/hq/more"
          className={`${styles.tab} ${moreActive ? styles.tabActive : ''}`}
          aria-current={moreActive ? 'page' : undefined}
        >
          <Glyph icon={FaEllipsisH} />
          <span>More</span>
        </NavLink>
      </nav>
    </div>
  );
}
