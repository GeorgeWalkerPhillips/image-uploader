import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Shell } from '../Shell';
import { useAcceptInvite } from '../teamHooks';
import { useAuthUser } from '../useAuthUser';
import { notify } from '../notify';
import {
  clearStashedToken, hasFragment, resolveToken, stashToken,
} from '../lib/joinToken';
import {
  isTerminalJoinError, joinHint, rpcErrorMessage, SIGNIN_FOR_JOIN, LOGIN_FOR_JOIN,
} from '../lib/planner';
import styles from '../wedding.module.css';

interface Failure {
  message: string;
  hint: string | null;
  // True when trying the same link again cannot work.
  terminal: boolean;
}

// /hq/join#token=...  Reachable by anyone; it does not sit behind the gate
// because the person joining has no wedding yet. The token is read from the URL
// fragment, removed from the address bar straight away, and kept only in memory
// (plus sessionStorage while the person signs in or up). It is never logged.
export function JoinPage() {
  const { user } = useAuthUser();
  const location = useLocation();
  const navigate = useNavigate();
  const accept = useAcceptInvite();
  const signedIn = !!user;

  const [token, setToken] = useState<string | null>(() => resolveToken(location.hash));
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState('');
  const [failure, setFailure] = useState<Failure | null>(null);
  const submitting = useRef(false);

  // Remove the fragment (history.replaceState via the router) before anything else.
  useEffect(() => {
    if (hasFragment(location.hash)) {
      navigate({ pathname: location.pathname, search: location.search, hash: '' }, { replace: true });
    }
  }, [location.hash, location.pathname, location.search, navigate]);

  // Keep the token across the sign-in / sign-up round trip only; once signed in
  // the stored copy is not needed any more.
  useEffect(() => {
    if (!token) return;
    if (signedIn) clearStashedToken();
    else stashToken(token);
  }, [token, signedIn]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || submitting.current || accept.isPending) return; // double-submit guard
    const display = name.trim();
    if (display.length > 80) {
      setNameError('Keep your name under 80 characters.');
      return;
    }
    setNameError('');
    setFailure(null);
    submitting.current = true;
    try {
      await accept.mutateAsync({ token, displayName: display === '' ? null : display });
      clearStashedToken();
      setToken(null);
      notify.success('You have joined the wedding');
      navigate('/hq/', { replace: true });
    } catch (err) {
      clearStashedToken();
      const message = rpcErrorMessage(err, 'Could not accept the invitation. Please try again.');
      const terminal = isTerminalJoinError(message);
      if (terminal) setToken(null);
      setFailure({ message, hint: joinHint(message), terminal });
    } finally {
      submitting.current = false;
    }
  };

  if (failure?.terminal) {
    return (
      <Shell title="Wedding invitation">
        <section className={styles.card} aria-label="Invitation problem">
          <h2 className={styles.h2}>We could not add you</h2>
          <p className={styles.error} role="alert">{failure.message}</p>
          {failure.hint && <p className={styles.muted}>{failure.hint}</p>}
          <div className={styles.actions}>
            <Link to="/hq/" className={styles.btn}>Continue</Link>
          </div>
        </section>
      </Shell>
    );
  }

  if (!token) {
    return (
      <Shell title="Wedding invitation">
        <section className={styles.card} aria-label="Invitation link incomplete">
          <h2 className={styles.h2}>This invitation link is incomplete</h2>
          <p>
            Open the link from your invitation email again. If you opened it in a different browser to the one you
            signed in with, open it in this one.
          </p>
          <div className={styles.actions}>
            <Link to="/hq/" className={styles.btn}>Go to Wedding HQ</Link>
          </div>
        </section>
      </Shell>
    );
  }

  return (
    <Shell title="Wedding invitation">
      <section className={styles.card} aria-label="Invitation">
        <h2 className={styles.h2}>You've been invited to help plan a wedding</h2>
        <p>
          Accepting adds you to a private wedding planner. Use the same email address the invitation was sent to, and
          make sure you have confirmed it.
        </p>
        {!signedIn ? (
          <>
            <p className={styles.hint}>
              Sign in or create an account first. After signing up, confirm your email address from the message we
              send you, then open the invitation link again if you are not brought back here.
            </p>
            <div className={styles.actions}>
              <Link to={LOGIN_FOR_JOIN} className={styles.btnPrimary}>Create an account</Link>
              <Link to={SIGNIN_FOR_JOIN} className={styles.btn}>Sign in</Link>
            </div>
          </>
        ) : (
          <form onSubmit={(e) => void submit(e)} noValidate aria-label="Accept invitation">
            <div className={styles.fieldWrap}>
              <label className={styles.field}>
                <span>Your name (optional, shown to the couple)</span>
                <input className={styles.input} value={name} maxLength={80} autoComplete="name"
                  aria-invalid={!!nameError} onChange={(e) => setName(e.target.value)} />
              </label>
              {nameError && <span className={styles.error} role="alert">{nameError}</span>}
            </div>
            {failure && (
              <div role="alert">
                <p className={styles.error}>{failure.message}</p>
                {failure.hint && <p className={styles.muted}>{failure.hint}</p>}
              </div>
            )}
            <div className={styles.actions}>
              <button type="submit" className={styles.btnPrimary} disabled={accept.isPending}>
                {accept.isPending ? 'Joining...' : 'Join this wedding'}
              </button>
            </div>
          </form>
        )}
      </section>
    </Shell>
  );
}
