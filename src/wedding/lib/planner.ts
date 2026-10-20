// Pure logic for the planner product's front door: which screen a signed-in
// user sees at /hq/*, the "Set up your wedding" form, and plain-English copy for
// the database's error strings. No React, no Supabase.
import { isISODate } from './moneyForms';
import type { FieldErrors, Validated } from './validators';
import type { PlannerStatus, Role } from '../types';

export const NO_STATUS: PlannerStatus = { entitled: false, wedding_id: null, access: null, role: null };

// my_wedding_planner_status() returns one json object (or a one-row array).
// A malformed reply throws instead of becoming "not entitled", so a bad reply
// shows an error screen and never a purchase prompt to someone who has paid.
export function parsePlannerStatus(raw: unknown): PlannerStatus {
  const row = Array.isArray(raw) ? raw[0] : raw;
  if (!row || typeof row !== 'object') throw new Error('Unexpected reply from the server.');
  const r = row as Record<string, unknown>;
  const role = r.role === 'groom' || r.role === 'bride' ? r.role : null;
  return {
    entitled: r.entitled === true,
    wedding_id: typeof r.wedding_id === 'string' ? r.wedding_id : null,
    access: r.access === 'partner' || r.access === 'collaborator' ? r.access : null,
    role,
  };
}

export type GateScreen = 'login' | 'partner' | 'collaborator' | 'setup' | 'get-planner';

// What a non-member's status means. Access wins over entitlement: a partner who
// joined by invite is not entitled but has the full app.
export function screenForStatus(status: PlannerStatus): Exclude<GateScreen, 'login'> {
  if (status.access === 'partner') return 'partner';
  if (status.access === 'collaborator') return 'collaborator';
  return status.entitled ? 'setup' : 'get-planner';
}

export const LOGIN_FOR_HQ = '/login?next=%2Fhq%2F';
export const LOGIN_FOR_JOIN = '/login?mode=signup&next=%2Fhq%2Fjoin';
export const SIGNIN_FOR_JOIN = '/login?mode=signin&next=%2Fhq%2Fjoin';

// ------------------------------------------------------------ setup form

export interface SetupValues {
  name: string;
  weddingDate: string;
  role: '' | Role;
  displayName: string;
}

// Argument names match create_my_wedding(p_name, p_wedding_date, p_my_role, p_my_display_name).
export interface SetupPayload {
  p_name: string;
  p_wedding_date: string;
  p_my_role: Role;
  p_my_display_name: string;
}

export const emptySetup = (): SetupValues => ({ name: '', weddingDate: '', role: '', displayName: '' });

export function validateSetup(v: SetupValues): Validated<SetupPayload> {
  const errors: FieldErrors = {};
  const name = v.name.trim();
  const display = v.displayName.trim();
  if (!name) errors.name = 'Give your wedding a name.';
  else if (name.length > 120) errors.name = 'Keep the name under 120 characters.';
  if (!v.weddingDate.trim()) errors.weddingDate = 'Choose the wedding date.';
  else if (!isISODate(v.weddingDate.trim())) errors.weddingDate = 'Choose a valid date.';
  if (v.role !== 'groom' && v.role !== 'bride') errors.role = 'Choose which one you are.';
  if (!display) errors.displayName = 'Enter your name.';
  else if (display.length > 80) errors.displayName = 'Keep your name under 80 characters.';
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: { p_name: name, p_wedding_date: v.weddingDate.trim(), p_my_role: v.role as Role, p_my_display_name: display },
  };
}

// ------------------------------------------------------------ error copy

// The strings the database functions raise on purpose (WEDDING_PLANNER_CONTRACT.md).
// Only these are shown verbatim; anything else gets the caller's generic fallback,
// so an unexpected server message never reaches the screen.
export const SAFE_RPC_MESSAGES: readonly string[] = [
  'Please sign in with a full account.',
  'Please confirm your email address first.',
  'This invite is not valid or has expired.',
  'You already belong to a wedding.',
  'This wedding cannot accept more people.',
  'This wedding has reached its limit of 10 collaborators.',
  'Purchase the planner to create a wedding.',
  'Wedding name must be 1 to 120 characters.',
  'Please choose the wedding date.',
  'Role must be groom or bride.',
  'Your name must be 1 to 80 characters.',
  'Not allowed.',
  'Collaborator not found.',
  'Invite not found.',
  'You are not a collaborator on any wedding.',
  "Collaborators can only change a task's status.",
  'Tasks can only be assigned to people in this wedding.',
];

const OFFLINE_RE = /offline|can't be saved until/i;

export function rpcErrorMessage(e: unknown, fallback: string): string {
  const message = e instanceof Error ? e.message : typeof e === 'string' ? e : '';
  if (SAFE_RPC_MESSAGES.includes(message)) return message;
  if (OFFLINE_RE.test(message)) return message;
  return fallback;
}

// Extra guidance for the join page, keyed by the database message.
export function joinHint(message: string): string | null {
  switch (message) {
    case 'Please confirm your email address first.':
      return 'Open the confirmation email we sent when you signed up, tap the link, then come back and try again.';
    case 'This invite is not valid or has expired.':
      return 'Check that you are signed in with the email address the invitation was sent to, or ask for a new invitation.';
    case 'You already belong to a wedding.':
      return 'Each account can belong to one wedding. To join this one, sign out and use a different account.';
    case 'This wedding cannot accept more people.':
      return 'Ask the couple to free up a place and send a new invitation.';
    default:
      return null;
  }
}

// Failures where trying the same invite again cannot help, so the token is dropped.
export function isTerminalJoinError(message: string): boolean {
  return (
    message === 'This invite is not valid or has expired.' ||
    message === 'You already belong to a wedding.' ||
    message === 'This wedding cannot accept more people.'
  );
}
