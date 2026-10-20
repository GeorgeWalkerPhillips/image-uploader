import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import s from './install.module.css';

export type SheetKind = 'ios' | 'ios-browser' | 'in-app';

// Small inline illustrations (no external images). Decorative: the step text carries the meaning.
function ShareFigure() {
  return (
    <svg className={s.figure} viewBox="0 0 64 64" width="56" height="56" aria-hidden="true" focusable="false">
      <rect x="4" y="4" width="56" height="56" rx="14" fill="rgba(0,0,0,0.05)" />
      <path d="M32 12v26M22 22l10-10 10 10" fill="none" stroke="#0a63e0" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M22 30h-4a3 3 0 0 0-3 3v15a3 3 0 0 0 3 3h28a3 3 0 0 0 3-3V33a3 3 0 0 0-3-3h-4" fill="none" stroke="#0a63e0" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AddHomeFigure() {
  return (
    <svg className={s.figure} viewBox="0 0 64 64" width="56" height="56" aria-hidden="true" focusable="false">
      <rect x="4" y="4" width="56" height="56" rx="14" fill="rgba(0,0,0,0.05)" />
      <rect x="16" y="16" width="32" height="32" rx="7" fill="none" stroke="#111" strokeWidth="3.5" />
      <path d="M32 24v16M24 32h16" stroke="#111" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  );
}

function AddFigure() {
  return (
    <svg className={s.figure} viewBox="0 0 64 64" width="56" height="56" aria-hidden="true" focusable="false">
      <rect x="4" y="4" width="56" height="56" rx="14" fill="rgba(0,0,0,0.05)" />
      <rect x="12" y="22" width="40" height="20" rx="10" fill="#0a63e0" />
      <text x="32" y="36.5" textAnchor="middle" fontFamily="-apple-system, Helvetica, Arial, sans-serif" fontSize="12" fontWeight="700" fill="#fff">Add</text>
    </svg>
  );
}

function DotsFigure() {
  return (
    <svg className={s.figure} viewBox="0 0 64 64" width="56" height="56" aria-hidden="true" focusable="false">
      <rect x="4" y="4" width="56" height="56" rx="14" fill="rgba(0,0,0,0.05)" />
      <circle cx="19" cy="32" r="4.5" fill="#111" />
      <circle cx="32" cy="32" r="4.5" fill="#111" />
      <circle cx="45" cy="32" r="4.5" fill="#111" />
    </svg>
  );
}

function SafariFigure() {
  return (
    <svg className={s.figure} viewBox="0 0 64 64" width="56" height="56" aria-hidden="true" focusable="false">
      <rect x="4" y="4" width="56" height="56" rx="14" fill="rgba(0,0,0,0.05)" />
      <circle cx="32" cy="32" r="17" fill="none" stroke="#0a63e0" strokeWidth="3.5" />
      <path d="M38 26l-4 12-8 0 4-12z" fill="#0a63e0" />
    </svg>
  );
}

interface Step {
  figure: ReactNode;
  title: string;
  detail: string;
}

export const IOS_STEPS: readonly Step[] = [
  { figure: <ShareFigure />, title: 'Tap the Share button', detail: 'The square with an arrow pointing up, in the toolbar at the bottom of Safari (top of the screen on iPad).' },
  { figure: <AddHomeFigure />, title: 'Choose “Add to Home Screen”', detail: 'Scroll down in the menu if you can’t see it right away.' },
  { figure: <AddFigure />, title: 'Tap “Add”', detail: 'It’s in the top-right corner. Wedding HQ then appears on your Home Screen like any other app.' },
];

export const IN_APP_STEPS: readonly Step[] = [
  { figure: <DotsFigure />, title: 'Tap the ••• menu', detail: 'It’s in a corner of this screen, usually top right (or bottom right).' },
  { figure: <SafariFigure />, title: 'Choose “Open in Safari”', detail: 'On Android it says “Open in browser” or “Open in Chrome”.' },
  { figure: <ShareFigure />, title: 'Then add it to your Home Screen', detail: 'In Safari tap Share, then “Add to Home Screen”, then “Add”.' },
];

export function StepList({ steps, label }: { steps: readonly Step[]; label: string }) {
  return (
    <ol className={s.steps} aria-label={label}>
      {steps.map((st, i) => (
        <li key={st.title} className={s.step}>
          {st.figure}
          <div className={s.stepText}>
            <strong>
              <span className={s.stepNum} aria-hidden="true">{i + 1}</span>
              {st.title}
            </strong>
            <span className={s.stepDetail}>{st.detail}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

// A modal bottom sheet: focus moves in, Tab stays inside, Escape and the
// backdrop close it, and focus goes back to what opened it.
export function InstallSheet({ kind, onClose }: { kind: SheetKind; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const first = ref.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? ref.current)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab' || !ref.current) return;
      const items = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      const active = document.activeElement;
      if (!ref.current.contains(active)) {
        e.preventDefault();
        firstEl.focus();
      } else if (e.shiftKey && active === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && active === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      opener?.focus?.();
    };
  }, []);

  const inApp = kind === 'in-app';
  const title = inApp ? 'Open in your browser first' : 'Add Wedding HQ to your Home Screen';
  return createPortal(
    <div className={s.backdrop} onClick={onClose} data-testid="install-backdrop">
      <div
        ref={ref}
        className={s.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby="hq-install-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={s.sheetHead}>
          <h2 id="hq-install-title" className={s.sheetTitle}>{title}</h2>
          <button type="button" className={s.closeBtn} onClick={onClose} aria-label="Close">
            <span aria-hidden="true">×</span>
          </button>
        </div>
        {inApp ? (
          <>
            <p className={s.sheetLead}>
              This page is open inside another app (like Instagram, Facebook or WhatsApp), and those can’t install apps.
            </p>
            <StepList steps={IN_APP_STEPS} label="Steps to open in your browser" />
          </>
        ) : (
          <>
            {kind === 'ios-browser' && (
              <p className={s.sheetLead}>
                Chrome and Firefox on iPhone can do this too (iOS 16.4 or later): open their Share button or ••• menu
                and follow the same steps. If you don’t see “Add to Home Screen”, open this page in Safari instead.
              </p>
            )}
            <StepList steps={IOS_STEPS} label="Steps to add to your Home Screen" />
            <p className={s.sheetNote}>
              The Home Screen app keeps its own copy of your data on iPhone: sign in once there, then tap “Save for offline” in More.
            </p>
          </>
        )}
        <button type="button" className={`${s.doneBtn}`} onClick={onClose}>Got it</button>
      </div>
    </div>,
    document.body
  );
}
