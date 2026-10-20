import { useState } from 'react';
import type { FormEvent } from 'react';
import { useWedding } from '../WeddingContext';
import { useAuthUser } from '../useAuthUser';
import { useInviteAction, useInvites, useRemoveCollaborator, useWeddingPeople } from '../teamHooks';
import { notify } from '../notify';
import { Skeleton } from '../components/Skeleton';
import { ErrorRetry } from '../components/ErrorRetry';
import { SelectField, TextField } from '../components/fields';
import { useNow } from '../components/useNow';
import {
  canInvitePartner, canResend, canRevoke, couple, helperSlots, helpers, INVITE_STATUS_LABELS, inviteErrorMessage,
  inviteStatus, KIND_LABELS, sortInvites, statusOfError, validateInvite,
} from '../lib/team';
import type { InviteForm } from '../lib/team';
import { rpcErrorMessage } from '../lib/planner';
import { formatDateJhb } from '../lib/time';
import type { FieldErrors } from '../lib/validators';
import type { InviteKind, InviteRow } from '../types';
import styles from '../wedding.module.css';

const HELPER_EXPLAINER =
  'Helpers only see the tasks you assign to them, and can tick them off or change their status. They never see your budget, files, guest list, calendar, settings or reminders.';

const emptyInvite = (): InviteForm => ({ email: '', kind: 'collaborator', displayName: '' });

// Couple members only (the helper app has no route here, and the database
// refuses everyone else): the team, invitations and what helpers can see.
export function TeamPage() {
  const { wedding } = useWedding();
  const { user } = useAuthUser();
  const now = useNow(60000);
  const people = useWeddingPeople(wedding.id);
  const invites = useInvites(wedding.id);
  const create = useInviteAction(wedding.id);
  const rowAction = useInviteAction(wedding.id);
  const remove = useRemoveCollaborator(wedding.id);

  const [form, setForm] = useState<InviteForm>(emptyInvite);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const set = <K extends keyof InviteForm>(key: K) => (value: InviteForm[K]) => setForm((p) => ({ ...p, [key]: value }));

  const team = people.data;
  const list = invites.data;

  if (people.isLoading || invites.isLoading) {
    return <><Skeleton height={120} /><Skeleton height={160} /><Skeleton height={120} /></>;
  }
  if ((people.isError && !team) || (invites.isError && !list)) {
    return (
      <div className={styles.card}>
        <ErrorRetry
          message="Could not load your team."
          onRetry={() => {
            void people.refetch();
            void invites.refetch();
          }}
        />
      </div>
    );
  }

  const members = couple(team ?? []);
  const helperPeople = helpers(team ?? []);
  const slots = helperSlots(team ?? [], list ?? [], now);
  const partnerAllowed = canInvitePartner(team ?? []);
  // Defensive: if the partner place filled while the form was open, fall back to helper.
  const kind: InviteKind = form.kind === 'partner' && !partnerAllowed ? 'collaborator' : form.kind;
  const helperBlocked = kind === 'collaborator' && slots.full;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (create.isPending) return; // double-submit guard
    const r = validateInvite({ ...form, kind }, { partnerAllowed });
    if (!r.ok) {
      setErrors(r.errors);
      return;
    }
    setErrors({});
    setFormError('');
    create.mutate(r.value, {
      onSuccess: () => {
        notify.success(`Invitation sent to ${r.value.email}`);
        setForm(emptyInvite());
      },
      onError: (err) => setFormError(inviteErrorMessage(statusOfError(err))),
    });
  };

  const act = (inv: InviteRow, action: 'resend' | 'revoke') => {
    if (rowAction.isPending) return;
    if (action === 'revoke' && !window.confirm(`Revoke the invitation to ${inv.email}? The link in their email will stop working.`)) {
      return;
    }
    rowAction.mutate(
      { action, inviteId: inv.id },
      {
        onSuccess: () => notify.success(action === 'resend' ? `Invitation resent to ${inv.email}` : 'Invitation revoked'),
        onError: (err) => notify.error(inviteErrorMessage(statusOfError(err))),
      }
    );
  };

  const removeHelper = (userId: string, name: string) => {
    if (remove.isPending) return;
    if (!window.confirm(`Remove ${name} from your wedding? Tasks assigned to them will become unassigned.`)) return;
    remove.mutate(userId, {
      onSuccess: () => notify.success(`${name} was removed`),
      onError: (err) => notify.error(rpcErrorMessage(err, 'Could not remove them. Please try again.')),
    });
  };

  const sorted = sortInvites(list ?? [], now);
  const open = sorted.filter((i) => ['pending', 'expired'].includes(inviteStatus(i, now)));
  const past = sorted.filter((i) => !['pending', 'expired'].includes(inviteStatus(i, now))).slice(0, 10);
  const busyInvite = rowAction.isPending ? rowAction.variables : undefined;
  const busyId = busyInvite && 'inviteId' in busyInvite ? busyInvite.inviteId : null;

  const inviteRow = (inv: InviteRow) => {
    const s = inviteStatus(inv, now);
    const busy = busyId === inv.id;
    return (
      <li key={inv.id} className={styles.teamRow}>
        <div className={styles.itemMain}>
          <strong>{inv.display_name ? `${inv.display_name} · ${inv.email}` : inv.email}</strong>
          <span className={styles.muted}>
            {KIND_LABELS[inv.kind]} · {s === 'pending' || s === 'expired'
              ? `${s === 'expired' ? 'Expired' : 'Expires'} ${formatDateJhb(inv.expires_at)}`
              : s === 'accepted' && inv.accepted_at
                ? `Accepted ${formatDateJhb(inv.accepted_at)}`
                : s === 'revoked' && inv.revoked_at
                  ? `Revoked ${formatDateJhb(inv.revoked_at)}`
                  : ''}
          </span>
          <div className={styles.chipRow}>
            <span className={`${styles.chip} ${s === 'pending' ? styles.chipCatch : ''}`}>{INVITE_STATUS_LABELS[s]}</span>
          </div>
        </div>
        {(canResend(s) || canRevoke(s)) && (
          <div className={styles.teamActions}>
            {canResend(s) && (
              <button type="button" className={styles.btn} disabled={rowAction.isPending}
                aria-label={`Resend invitation to ${inv.email}`} onClick={() => act(inv, 'resend')}>
                {busy ? 'Working...' : 'Resend'}
              </button>
            )}
            {canRevoke(s) && (
              <button type="button" className={styles.btnDanger} disabled={rowAction.isPending}
                aria-label={`Revoke invitation to ${inv.email}`} onClick={() => act(inv, 'revoke')}>
                Revoke
              </button>
            )}
          </div>
        )}
      </li>
    );
  };

  return (
    <>
      <section className={styles.card} aria-label="Who can see your wedding">
        <h2 className={styles.h2}>Your team</h2>
        <p className={styles.muted}>
          Your partner has full access, just like you. {HELPER_EXPLAINER}
        </p>
      </section>

      <section className={styles.card} aria-label="The couple">
        <h2 className={styles.h2}>The couple</h2>
        <ul className={styles.itemList}>
          {members.map((p) => (
            <li key={p.user_id} className={styles.teamRow}>
              <div className={styles.itemMain}>
                <strong>{p.display_name}{p.user_id === user?.id ? ' (you)' : ''}</strong>
                <span className={styles.muted}>{p.role === 'groom' ? 'Groom' : p.role === 'bride' ? 'Bride' : 'Partner'} · Full access</span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.card} aria-label="Helpers">
        <h2 className={styles.h2}>
          Helpers <span className={styles.count}>{slots.total} of {slots.cap}</span>
        </h2>
        <p className={styles.muted}>
          Up to {slots.cap} helpers, counting invitations that are still pending.
        </p>
        {helperPeople.length === 0 ? (
          <p className={styles.muted}>No helpers yet.</p>
        ) : (
          <ul className={styles.itemList}>
            {helperPeople.map((p) => (
              <li key={p.user_id} className={styles.teamRow}>
                <div className={styles.itemMain}>
                  <strong>{p.display_name}</strong>
                  <span className={styles.muted}>Helper · Sees only tasks assigned to them</span>
                </div>
                <button type="button" className={styles.btnDanger} disabled={remove.isPending}
                  aria-label={`Remove ${p.display_name}`} onClick={() => removeHelper(p.user_id, p.display_name)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <form className={styles.card} onSubmit={submit} noValidate aria-label="Invite someone">
        <h2 className={styles.h2}>Invite someone</h2>
        <TextField label="Email address" type="email" value={form.email} error={errors.email} maxLength={254}
          onChange={set('email')} placeholder="name@example.com" />
        <SelectField label="They can" value={kind} error={errors.kind} onChange={(x) => set('kind')(x as InviteKind)}>
          <option value="collaborator">Helper (sees only tasks assigned to them)</option>
          {partnerAllowed && <option value="partner">Partner (full access)</option>}
        </SelectField>
        <TextField label="Their name (optional)" value={form.displayName} maxLength={80} error={errors.displayName}
          onChange={set('displayName')} />
        <p className={styles.muted}>
          {kind === 'partner'
            ? 'A partner can see and change everything, like you. Only one partner place is available.'
            : HELPER_EXPLAINER}{' '}
          They must sign in with this email address and confirm it. The link works for 14 days.
        </p>
        {helperBlocked && (
          <p className={styles.error} role="alert">
            You have reached the limit of {slots.cap} helpers. Remove a helper or revoke a pending invitation first.
          </p>
        )}
        {formError && <p className={styles.error} role="alert">{formError}</p>}
        <div className={styles.actions}>
          <button type="submit" className={styles.btnPrimary} disabled={create.isPending || helperBlocked}>
            {create.isPending ? 'Sending...' : 'Send invitation'}
          </button>
        </div>
      </form>

      <section className={styles.card} aria-label="Invitations">
        <h2 className={styles.h2}>Invitations</h2>
        {invites.isError && (
          <ErrorRetry message="Could not refresh invitations." onRetry={() => void invites.refetch()} />
        )}
        {open.length === 0 && past.length === 0 ? (
          <p className={styles.muted}>No invitations yet.</p>
        ) : (
          <>
            {open.length > 0 && <ul className={styles.itemList} aria-label="Open invitations">{open.map(inviteRow)}</ul>}
            {past.length > 0 && (
              <>
                <h3 className={`${styles.h3} ${styles.pastHeading}`}>Past invitations</h3>
                <ul className={styles.itemList} aria-label="Past invitations">{past.map(inviteRow)}</ul>
              </>
            )}
          </>
        )}
      </section>
    </>
  );
}
