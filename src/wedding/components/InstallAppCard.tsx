import { useRef, useState } from 'react';
import { notify } from '../notify';
import { useInstallApp } from '../useInstallApp';
import type { InstallApp } from '../useInstallApp';
import { IN_APP_STEPS, InstallSheet, StepList } from './InstallSheet';
import type { SheetKind } from './InstallSheet';
import styles from '../wedding.module.css';
import s from './install.module.css';

type Kind = 'in-app' | 'ios' | 'ios-browser' | 'prompt' | 'menu';

function kindOf(app: InstallApp): Kind {
  if (app.inApp) return 'in-app';
  if (app.canPrompt) return 'prompt';
  if (app.platform === 'ios-safari') return 'ios';
  if (app.iosVariant === 'browser') return 'ios-browser';
  return 'menu';
}

const BLURB: Record<Kind, string> = {
  prompt: 'Opens like a normal app from your home screen, full screen and without the browser bars.',
  ios: 'On iPhone and iPad this is done from Safari’s Share menu. It takes about 10 seconds.',
  'ios-browser': 'On iPhone and iPad this is done from the browser’s Share menu. It takes about 10 seconds.',
  'in-app': 'You’re viewing this inside another app, which can’t install Wedding HQ. Open it in your browser first:',
  menu: 'Use your browser menu → Install app / Add to Home screen.',
};

// "Install app" for Wedding HQ. `banner` is the compact, dismissible strip at
// the top of Home; `section` is the permanent card in More (and the helper
// app). Renders nothing once the app is installed.
export function InstallAppCard({ variant }: { variant: 'banner' | 'section' }) {
  const app = useInstallApp();
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const busyRef = useRef(false);

  if (app.installed) return null;
  const kind = kindOf(app);
  const banner = variant === 'banner';
  // The banner only nags when there is something to do; the More card always explains.
  if (banner && (app.dismissed || (kind === 'menu' && !accepted))) return null;

  const install = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const outcome = await app.promptInstall();
    busyRef.current = false;
    setBusy(false);
    if (outcome === 'accepted') {
      setAccepted(true);
      notify.success('Installing Wedding HQ. It will show up with your other apps in a moment.');
    } else if (outcome === 'dismissed') {
      notify.warning('No problem. You can install it any time from More → Get the app.');
    } else {
      notify.error('Your browser didn’t open the install prompt. Try its menu → Install app / Add to Home screen.');
    }
  };

  const soft = app.dismissed && !banner;
  const btnClass = banner || !soft ? styles.btnPrimary : styles.btn;
  let action: JSX.Element | null = null;
  if (accepted) {
    action = <p className={styles.muted} role="status">Installing…</p>;
  } else if (kind === 'prompt') {
    action = (
      <button type="button" className={btnClass} onClick={() => void install()} disabled={busy}>
        {busy ? 'Installing…' : 'Install app'}
      </button>
    );
  } else if (kind === 'ios' || kind === 'ios-browser') {
    action = (
      <button type="button" className={btnClass} onClick={() => setSheet(kind)} aria-haspopup="dialog">
        Add to Home Screen
      </button>
    );
  } else if (kind === 'in-app' && banner) {
    action = (
      <button type="button" className={btnClass} onClick={() => setSheet('in-app')} aria-haspopup="dialog">
        Show me how
      </button>
    );
  }

  const modal = sheet ? <InstallSheet kind={sheet} onClose={() => setSheet(null)} /> : null;

  if (banner) {
    return (
      <section className={`${styles.card} ${s.banner}`} aria-label="Install Wedding HQ">
        <div className={s.bannerText}>
          <strong>Install Wedding HQ</strong>
          <span className={styles.muted}>
            {kind === 'in-app' ? 'Open it in your browser to install it.' : 'Keep it on your home screen, one tap away.'}
          </span>
        </div>
        {action}
        <button type="button" className={s.dismissBtn} onClick={app.dismiss} aria-label="Dismiss install suggestion">
          <span aria-hidden="true">×</span>
        </button>
        {modal}
      </section>
    );
  }

  return (
    <section className={styles.card} aria-labelledby="hq-install-heading">
      <h3 id="hq-install-heading" className={styles.h3}>Install Wedding HQ</h3>
      <p className={styles.muted}>{soft ? 'Changed your mind? You can install it any time.' : BLURB[kind]}</p>
      {kind === 'in-app' && <StepList steps={IN_APP_STEPS} label="Steps to open in your browser" />}
      {soft && kind === 'menu' && <p className={styles.muted}>{BLURB.menu}</p>}
      {action && <div className={styles.actions}>{action}</div>}
      {modal}
    </section>
  );
}
