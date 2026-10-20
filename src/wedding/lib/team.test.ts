import {
  canInvitePartner, canResend, canRevoke, helperSlots, inviteErrorMessage, inviteStatus, sortInvites, statusOfError,
  validateInvite,
} from './team';
import type { InviteRow, Person } from '../types';

const NOW = new Date('2026-10-20T10:00:00Z');
const inv = (over: Partial<InviteRow> = {}): InviteRow => ({
  id: 'i1', wedding_id: 'w1', email: 'sam@example.com', kind: 'collaborator', display_name: null,
  expires_at: '2026-11-01T00:00:00Z', accepted_at: null, revoked_at: null, created_at: '2026-10-19T00:00:00Z', ...over,
});
const person = (id: string, kind: Person['kind']): Person => ({ user_id: id, display_name: id, kind, role: kind === 'partner' ? 'groom' : null });

describe('inviteStatus', () => {
  it('derives pending, expired, accepted and revoked (revoked wins)', () => {
    expect(inviteStatus(inv(), NOW)).toBe('pending');
    expect(inviteStatus(inv({ expires_at: '2026-10-20T10:00:00Z' }), NOW)).toBe('expired');
    expect(inviteStatus(inv({ accepted_at: '2026-10-20T09:00:00Z' }), NOW)).toBe('accepted');
    expect(inviteStatus(inv({ accepted_at: 'x', revoked_at: '2026-10-20T09:00:00Z' }), NOW)).toBe('revoked');
  });
  it('offers resend for open invites and revoke only for pending ones', () => {
    expect(canResend('pending') && canResend('expired')).toBe(true);
    expect(canResend('accepted') || canResend('revoked')).toBe(false);
    expect(canRevoke('pending')).toBe(true);
    expect(canRevoke('expired') || canRevoke('accepted')).toBe(false);
  });
});

describe('validateInvite', () => {
  const base = { email: ' Sam@Example.com ', kind: 'collaborator' as const, displayName: '' };
  it('lower-cases the email and omits an empty name', () => {
    expect(validateInvite(base, { partnerAllowed: true })).toEqual({
      ok: true, value: { action: 'create', email: 'sam@example.com', kind: 'collaborator' },
    });
  });
  it('includes a trimmed display name', () => {
    const r = validateInvite({ ...base, displayName: ' Sam ' }, { partnerAllowed: true });
    expect(r.ok && r.value.displayName).toBe('Sam');
  });
  it('rejects a bad email, a long name and a partner invite with no free place', () => {
    expect(!validateInvite({ ...base, email: 'nope' }, { partnerAllowed: true }).ok).toBe(true);
    expect(!validateInvite({ ...base, email: '' }, { partnerAllowed: true }).ok).toBe(true);
    const r = validateInvite({ ...base, kind: 'partner', displayName: 'x'.repeat(81) }, { partnerAllowed: false });
    expect(!r.ok && Object.keys(r.errors).sort()).toEqual(['displayName', 'kind']);
  });
  it('allows a partner invite when a place is free', () => {
    const r = validateInvite({ ...base, kind: 'partner' }, { partnerAllowed: true });
    expect(r.ok && r.value.kind).toBe('partner');
  });
});

describe('team maths', () => {
  it('offers a partner invite only while the couple has fewer than 2 members', () => {
    expect(canInvitePartner([person('a', 'partner')])).toBe(true);
    expect(canInvitePartner([person('a', 'partner'), person('b', 'partner'), person('h', 'collaborator')])).toBe(false);
  });
  it('counts pending helper invites against the 10 cap', () => {
    const people = Array.from({ length: 8 }, (_, i) => person(`h${i}`, 'collaborator'));
    const slots = helperSlots(people, [inv(), inv({ id: 'i2' }), inv({ id: 'i3', revoked_at: 'x' }), inv({ id: 'i4', kind: 'partner' })], NOW);
    expect(slots).toMatchObject({ used: 8, pending: 2, total: 10, cap: 10, full: true });
  });
  it('lists open invites first, newest first', () => {
    const sorted = sortInvites(
      [inv({ id: 'old', created_at: '2026-10-01T00:00:00Z' }), inv({ id: 'rev', revoked_at: 'x', created_at: '2026-10-19T00:00:00Z' }), inv({ id: 'new', created_at: '2026-10-18T00:00:00Z' })],
      NOW
    );
    expect(sorted.map((i) => i.id)).toEqual(['new', 'old', 'rev']);
  });
});

describe('inviteErrorMessage', () => {
  it('has plain copy for every documented status', () => {
    const msgs = [400, 403, 404, 409, 429, 502, 0, 500].map(inviteErrorMessage);
    expect(new Set(msgs).size).toBe(msgs.length);
    expect(inviteErrorMessage(409)).toMatch(/pending|free places/);
    expect(inviteErrorMessage(429)).toMatch(/24 hours/);
    expect(inviteErrorMessage(502)).toMatch(/nothing is pending/);
    expect(inviteErrorMessage(0)).toMatch(/connection/);
  });
  it('reads a status off an error', () => {
    expect(statusOfError(Object.assign(new Error('x'), { status: 429 }))).toBe(429);
    expect(statusOfError(new Error('x'))).toBe(0);
    expect(statusOfError(null)).toBe(0);
  });
});
