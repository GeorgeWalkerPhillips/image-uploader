import React from 'react';
import { Link } from 'react-router-dom';
import styles from './ContentChrome.module.css';

// Header, footer and inline-link renderer shared by the About page and the
// guides (the public, indexable content pages).
export function ContentHeader() {
  return (
    <>
      <header className={styles.nav}>
        <Link to="/" aria-label="Valere home" className={styles.navBrandLink}>
          <img className={styles.navBrand} src="/valere_logo.png" alt="valere" width="85" height="28" />
        </Link>
        <nav className={styles.navLinks} aria-label="Main">
          <Link to="/wedding-planner">Wedding Planner</Link>
          <Link to="/guides">Guides</Link>
          <Link to="/blog">Blog</Link>
          <Link to="/about">About</Link>
        </nav>
        <Link to="/login?mode=signup" className={styles.navCta}>
          Create an event
        </Link>
      </header>
      <nav className={styles.mobileSubNav} aria-label="Sections">
        <Link to="/wedding-planner">Wedding Planner</Link>
        <Link to="/guides">Guides</Link>
        <Link to="/blog">Blog</Link>
        <Link to="/about">About</Link>
      </nav>
    </>
  );
}

export function ContentFooter() {
  return (
    <footer className={styles.footer}>
      <p>&copy; {new Date().getFullYear()} Valere. All rights reserved.</p>
      <nav className={styles.footerLinks} aria-label="Footer">
        <Link to="/">Home</Link>
        <Link to="/guides">Guides</Link>
        <Link to="/blog">Blog</Link>
        <Link to="/about">About Valere</Link>
        <Link to="/wedding-planner">Wedding Planner</Link>
        <Link to="/privacy">Privacy Policy</Link>
        <Link to="/terms">Terms and Conditions</Link>
        <Link to="/refund-policy">Refund Policy</Link>
      </nav>
    </footer>
  );
}

export function Breadcrumb({ trail }) {
  return (
    <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
      {trail.map((t, i) => (
        <React.Fragment key={t.label}>
          {i > 0 && <span aria-hidden="true"> / </span>}
          {t.to ? <Link to={t.to}>{t.label}</Link> : <span aria-current="page">{t.label}</span>}
        </React.Fragment>
      ))}
    </nav>
  );
}

const LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/g;

// Turns "text [label](/path) more" into text with router links. Internal paths
// only: anything else is left as plain text rather than linked.
export function RichText({ text }) {
  const out = [];
  let last = 0;
  let m;
  LINK_RE.lastIndex = 0;
  while ((m = LINK_RE.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(
      <Link key={`${m.index}-${m[2]}`} to={m[2]}>
        {m[1]}
      </Link>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

// Plain text of a string that may contain [label](/path) links.
export const stripLinks = (text) => text.replace(LINK_RE, '$1');
