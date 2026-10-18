import type { ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { FaHome, FaWallet, FaTasks, FaCalendarAlt, FaEllipsisH } from 'react-icons/fa';
import type { IconType } from 'react-icons';
import { useWedding } from './WeddingContext';
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

const TITLES: Record<string, string> = {
  '/hq/budget': 'Budget',
  '/hq/tasks': 'Tasks',
  '/hq/calendar': 'Calendar',
  '/hq/more': 'More',
  '/hq/targets': 'Targets',
  '/hq/settings': 'Settings',
  '/hq/honeymoon': 'Honeymoon',
  '/hq/purchases': 'Purchases',
  '/hq/quotes': 'Quotes',
  '/hq/invoices': 'Invoices',
  '/hq/spending': 'Spending',
};

const NON_MORE = ['/hq', '/hq/budget', '/hq/tasks', '/hq/calendar'];

export function Layout({ children }: { children: ReactNode }) {
  const path = useLocation().pathname.replace(/\/+$/, '') || '/';
  const moreActive = !NON_MORE.some((p) => path === p || (p !== '/hq' && path.startsWith(`${p}/`)));

  const { wedding, member } = useWedding();
  const isHome = path === '/hq';
  const title = isHome ? wedding.name : (TITLES[path] ?? 'Wedding HQ');

  return (
    <div className={styles.root}>
      <div className={styles.container}>
        <header className={styles.header}>
          <Link to="/hq" className={styles.headerBrand} aria-label="Wedding HQ home">
            <img src="/valere_logo.png" alt="Valere" className={styles.headerBrandLogo} />
          </Link>
          <h1 className={styles.h1}>{title}</h1>
          {isHome && <p className={styles.headerSub}>Hi {member.display_name}</p>}
        </header>
        <main className={styles.main}>{children}</main>
      </div>
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
