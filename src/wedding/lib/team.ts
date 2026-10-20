// Pure logic for the Team page: invite form validation, invite status, the
// partner-slot rule, helper cap maths and plain copy for the invite function's
// error statuses.
import type { FieldErrors, Validated } from './validators';
import type { InviteKind, InviteRow, Person } from '../types';

export const HELPER_CAP = 10;
export const COUPLE_SIZE = 2;

export type InviteStatus = 'pending' | 'expired' | 'accepted' | 'revoked';

export function inviteStatus(inv: Pick<InviteRow, 'accepted_at' | 'revoked_at' | 'expires_at'>, now: Date): InviteStatus {
  if (inv.revoked_at) return 'revoked';
  if (inv.accepted_at) return 'accepted';
  return new Date(inv.expires_at).getTime() <= now.getTime() ? 'expired' : 'pending';
}

export const INVITE_STATUS_LABELS: Record<InviteStatus, string> = {
  pending: 'Pending', expired: 'Expired', accepted: 'Accepted', revoked: 'Revoked',
};
export const KIND_LABELS: Record<InviteKind, string> = { partner: 'Partner', collaborator: 'Helper' };

export const couple = (people: readonly Person[]): Person[] => people.filter((p) => p.kind === 'partner');
export const helpers = (people: readonly Person[]): Person[] => people.filter((p) => p.kind === 'collaborator');

// Only offered while a partner place is free. The function and the database
// re-check this; hiding it is a courtesy.
export const canInvitePartner = (people: readonly Person[]): boolean => couple(people).length < COUPLE_SIZE;

export interface InviteForm {
  email: string;
  kind: InviteKind;
  displayName: string;
}

export interface InvitePayload {
  action: 'create';
  email: string;
  kind: InviteKind;
  displayName?: string;
}

// Deliberately loose: the real check is the confirmed address at accept time.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateInvite(v: InviteForm, opts: { partnerAllowed: boolean }): Validated<InvitePayload> {
  const errors: FieldErrors = {};
  const email = v.email.trim().toLowerCase();
  const name = v.displayName.trim();
  if (!email) errors.email = 'Enter their email address.';
  else if (email.length > 254 || !EMAIL_RE.test(email)) errors.email = 'Enter a valid email address.';
  if (v.kind !== 'partner' && v.kind !== 'collaborator') errors.kind = 'Choose what they can do.';
  else if (v.kind === 'partner' && !opts.partnerAllowed) errors.kind = 'Both partner places are already taken.';
  if (name.length > 80) errors.displayName = 'Keep the name under 80 characters.';
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { action: 'create', email, kind: v.kind, ...(name ? { displayName: name } : {}) } };
}

// HTTP status of the wedding-invite function -> copy (status 0 = never reached it).
export function inviteErrorMessage(status: number): string {
  switch (status) {
    case 400:
      return 'That did not look right. Check the email address and name, then try again.';
    case 403:
      return 'Only the couple can manage invitations.';
    case 404:
      return 'That invitation no longer exists. The list has been refreshed.';
    case 409:
      return 'That invitation cannot be sent. This person may already be on the team or already have a pending invitation, or there are no free places left (2 partners, 10 helpers including pending invitations).';
    case 429:
      return "You've sent a lot of invitations in the last 24 hours (20 per wedding and per person, including revoked ones). Please try again tomorrow.";
    case 502:
      return 'We could not send the invitation email, so nothing is pending. Please try again.';
    case 0:
      return 'Could not reach the server. Check your connection and try again.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

export function statusOfError(e: unknown): number {
  const s = (e as { status?: unknown } | null)?.status;
  return typeof s === 'number' ? s : 0;
}

// Helpers plus helper invitations still open count against the cap of 10.
export function helperSlots(people: readonly Person[], invites: readonly InviteRow[], now: Date) {
  const used = helpers(people).length;
  const pending = invites.filter((i) => i.kind === 'collaborator' && inviteStatus(i, now) === 'pending').length;
  return { used, pending, total: used + pending, cap: HELPER_CAP, full: used + pending >= HELPER_CAP };
}

// Open invitations first (newest first), then the history.
export function sortInvites(invites: readonly InviteRow[], now: Date): InviteRow[] {
  const rank = (i: InviteRow): number => (inviteStatus(i, now) === 'pending' ? 0 : inviteStatus(i, now) === 'expired' ? 1 : 2);
  return [...invites].sort((a, b) => rank(a) - rank(b) || b.created_at.localeCompare(a.created_at));
}

export const canResend = (s: InviteStatus): boolean => s === 'pending' || s === 'expired';
export const canRevoke = (s: InviteStatus): boolean => s === 'pending';
