import type { ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { FaHome, FaWallet, FaTasks, FaCalendarAlt, FaEllipsisH } from 'react-icons/fa';
import type { IconType } from 'react-icons';
import { useWedding } from './WeddingContext';
import { useRealtimeSync } from './useRealtimeSync';
import type { ConnectionState } from './useRealtimeSync';
import { usePwa } from './usePwa';
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
  { to: '/hq/', label: 'Home', Icon: FaHome, end: true },
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
  '/hq/spending': 'Money spent so far',
};

const MONEY = ['/hq/budget', '/hq/quotes', '/hq/invoices', '/hq/spending'];
const NON_MORE = ['/hq', ...MONEY, '/hq/tasks', '/hq/calendar'];

const CONNECTION_LABEL: Record<ConnectionState, string> = {
  connecting: 'Connecting…',
  live: 'Live',
  reconnecting: 'Reconnecting…',
  offline: 'Offline',
};

// Subtle sync indicator. Text is always present, colour is only a hint.
function ConnectionBadge({ state }: { state: ConnectionState }) {
  return (
    <span className={`${styles.conn} ${styles[`conn_${state}`]}`} role="status" aria-live="polite" aria-label={`Sync status: ${CONNECTION_LABEL[state]}`}>
      <span className={styles.connDot} aria-hidden="true" />
      {CONNECTION_LABEL[state]}
    </span>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const path = useLocation().pathname.replace(/\/+$/, '') || '/';
  const moreActive = !NON_MORE.some((p) => path === p || (p !== '/hq' && path.startsWith(`${p}/`)));

  const { wedding, member } = useWedding();
  const connection = useRealtimeSync();
  usePwa();
  const isHome = path === '/hq';
  const onMoney = MONEY.includes(path);
  const title = isHome ? wedding.name : (TITLES[path] ?? 'Wedding HQ');

  return (
    <div className={styles.root}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div className={styles.headerTop}>
            <Link to="/hq/" className={styles.headerBrand} aria-label="Wedding HQ home">
              <img src="/valere_logo.png" alt="" className={styles.headerBrandLogo} />
            </Link>
            <ConnectionBadge state={connection} />
          </div>
          <h1 className={styles.h1}>{title}</h1>
          {isHome && <p className={styles.headerSub}>Hi {member.display_name}</p>}
        </header>
        {connection === 'offline' && (
          <p className={styles.offlineBanner} role="status">
            You're offline — showing last saved data
          </p>
        )}
        <main className={styles.main}>{children}</main>
      </div>
      <nav className={styles.tabs} aria-label="Wedding HQ">
        {TABS.map(({ to, label, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `${styles.tab} ${isActive || (to === '/hq/budget' && onMoney) ? styles.tabActive : ''}`
            }
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
