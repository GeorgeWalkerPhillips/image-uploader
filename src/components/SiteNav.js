import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { UserBadge } from './UserBadge';
import styles from './SiteNav.module.css';

// The one header for every public page (landing, Wedding Planner, About,
// Guides, Blog). Desktop: wordmark, inline links, actions. Mobile: the glass
// pill grows downward to reveal the links, so there is no loose second row.
//
// The menu is always in the DOM (crawlers and the prerendered HTML see every
// link); when collapsed on mobile CSS hides it with visibility:hidden, which
// also takes the links out of the tab order and the accessibility tree. We do
// not use the `inert` attribute because the prerender captures the DOM at a
// narrow viewport and a static `inert` would leave the links dead for a
// JS-less desktop visitor.

export const SITE_LINKS = [
  { to: '/wedding-planner', label: 'Wedding Planner' },
  { to: '/guides', label: 'Guides' },
  { to: '/blog', label: 'Blog' },
  { to: '/about', label: 'About' },
];

// Keep in sync with the breakpoint in SiteNav.module.css.
export const DESKTOP_QUERY = '(min-width: 960px)';

const getMql = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(DESKTOP_QUERY)
    : null;

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => {
    const mql = getMql();
    return mql ? mql.matches : true;
  });
  useEffect(() => {
    const mql = getMql();
    if (!mql) return undefined;
    const onChange = () => setIsDesktop(mql.matches);
    onChange();
    if (mql.addEventListener) mql.addEventListener('change', onChange);
    else mql.addListener(onChange);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', onChange);
      else mql.removeListener(onChange);
    };
  }, []);
  return isDesktop;
}

function currentState(pathname, to) {
  if (pathname === to) return 'page';
  if (pathname.startsWith(`${to}/`)) return 'true'; // a page inside this section
  return undefined;
}

// anchors: in-page links shown before the site links, e.g. [{ href: '#faq', label: 'FAQ' }].
// primaryAction: 'create' (black "Create an event") or 'signin' (black "Sign in").
// signInTo: where Sign in goes (carries a `next` for pages that want to return).
export function SiteNav({ anchors = [], primaryAction = 'create', signInTo = '/login?mode=signin' }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const isDesktop = useIsDesktop();
  const [open, setOpen] = useState(false);
  const toggleRef = useRef(null);
  const menuId = useId();
  const signedIn = !!user && !user.is_anonymous;

  const close = useCallback(() => setOpen(false), []);

  // Route change closes the menu.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Growing past the breakpoint closes it, so it cannot reopen stale on rotate back.
  useEffect(() => {
    if (isDesktop) setOpen(false);
  }, [isDesktop]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        if (toggleRef.current) toggleRef.current.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const createAction = (
    <Link to="/login?mode=signup" className={styles.cta}>
      Create an event
    </Link>
  );
  const signInAction = (
    <Link to={signInTo} className={primaryAction === 'signin' ? styles.cta : styles.signIn}>
      Sign in
    </Link>
  );

  return (
    <header className={styles.shell} data-open={open ? 'true' : 'false'}>
      <div className={styles.backdrop} onClick={close} aria-hidden="true" data-testid="site-nav-backdrop" />
      <nav className={`${styles.pill}${open ? ` ${styles.pillOpen}` : ''}`} aria-label="Main">
        <Link to="/" aria-label="Valere home" className={styles.brandLink}>
          <img className={styles.brand} src="/valere_logo.png" alt="valere" width="85" height="28" />
        </Link>

        <div className={styles.actions}>
          {signedIn ? (
            isDesktop && <UserBadge />
          ) : (
            <>
              {primaryAction === 'create' && <span className={styles.desktopOnly}>{signInAction}</span>}
              {primaryAction === 'create' ? createAction : signInAction}
            </>
          )}
          <button
            ref={toggleRef}
            type="button"
            className={styles.toggle}
            aria-expanded={open}
            aria-controls={menuId}
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((o) => !o)}
          >
            <span className={styles.bars} aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </button>
        </div>

        <div id={menuId} className={styles.panel}>
          <div className={styles.panelInner}>
            <div className={styles.panelBody}>
              <ul className={styles.links}>
                {anchors.map((a) => (
                  <li key={a.href}>
                    <a href={a.href} onClick={close}>
                      {a.label}
                    </a>
                  </li>
                ))}
                {SITE_LINKS.map((l, i) => (
                  <li key={l.to} className={i === 0 && anchors.length ? styles.groupStart : undefined}>
                    <Link to={l.to} aria-current={currentState(pathname, l.to)} onClick={close}>
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
              <div className={styles.account}>
                {signedIn ? (
                  !isDesktop && <UserBadge inline />
                ) : (
                  primaryAction === 'create' && (
                    <Link to={signInTo} className={styles.accountLink} onClick={close}>
                      Sign in
                    </Link>
                  )
                )}
              </div>
            </div>
          </div>
        </div>
      </nav>
    </header>
  );
}

export default SiteNav;
