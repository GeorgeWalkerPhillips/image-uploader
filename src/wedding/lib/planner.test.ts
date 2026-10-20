import {
  emptySetup, isTerminalJoinError, joinHint, LOGIN_FOR_HQ, NO_STATUS, parsePlannerStatus, rpcErrorMessage,
  SAFE_RPC_MESSAGES, screenForStatus, validateSetup,
} from './planner';

describe('parsePlannerStatus', () => {
  it('reads the contract shape (object or one-row array)', () => {
    const row = { entitled: true, wedding_id: 'w1', access: 'partner', role: 'bride' };
    expect(parsePlannerStatus(row)).toEqual(row);
    expect(parsePlannerStatus([row])).toEqual(row);
  });
  it('normalises unknown values to nulls and non-true entitlement to false', () => {
    expect(parsePlannerStatus({ entitled: 'yes', wedding_id: 5, access: 'admin', role: 'king' })).toEqual(NO_STATUS);
  });
  it('throws on a malformed reply instead of pretending "not entitled"', () => {
    expect(() => parsePlannerStatus(null)).toThrow();
    expect(() => parsePlannerStatus([])).toThrow();
    expect(() => parsePlannerStatus('x')).toThrow();
  });
});

describe('screenForStatus', () => {
  it('maps every status to one screen', () => {
    expect(screenForStatus({ entitled: true, wedding_id: 'w', access: 'partner', role: 'groom' })).toBe('partner');
    // a partner who joined by invite is not entitled but has the full app
    expect(screenForStatus({ entitled: false, wedding_id: 'w', access: 'partner', role: 'bride' })).toBe('partner');
    expect(screenForStatus({ entitled: false, wedding_id: 'w', access: 'collaborator', role: null })).toBe('collaborator');
    expect(screenForStatus({ entitled: true, wedding_id: null, access: null, role: null })).toBe('setup');
    expect(screenForStatus(NO_STATUS)).toBe('get-planner');
  });
  it('the sign-in redirect uses an encoded path the main app accepts', () => {
    expect(LOGIN_FOR_HQ).toBe('/login?next=%2Fhq%2F');
    expect(decodeURIComponent(LOGIN_FOR_HQ.split('next=')[1] ?? '')).toBe('/hq/');
  });
});

describe('validateSetup', () => {
  const ok = { ...emptySetup(), name: ' Ada and Ben ', weddingDate: '2027-03-06', role: 'groom' as const, displayName: ' Ada ' };
  it('builds the RPC arguments', () => {
    expect(validateSetup(ok)).toEqual({
      ok: true,
      value: { p_name: 'Ada and Ben', p_wedding_date: '2027-03-06', p_my_role: 'groom', p_my_display_name: 'Ada' },
    });
  });
  it('requires every field', () => {
    const r = validateSetup(emptySetup());
    expect(!r.ok && Object.keys(r.errors).sort()).toEqual(['displayName', 'name', 'role', 'weddingDate']);
  });
  it('enforces the database limits and a real date', () => {
    const r = validateSetup({ ...ok, name: 'x'.repeat(121), displayName: 'y'.repeat(81), weddingDate: '2027-02-30' });
    expect(!r.ok && Object.keys(r.errors).sort()).toEqual(['displayName', 'name', 'weddingDate']);
  });
});

describe('error copy', () => {
  it('shows the contract strings verbatim and hides everything else', () => {
    for (const m of SAFE_RPC_MESSAGES) expect(rpcErrorMessage(new Error(m), 'fallback')).toBe(m);
    expect(rpcErrorMessage(new Error('duplicate key value violates unique constraint "x"'), 'fallback')).toBe('fallback');
    expect(rpcErrorMessage(null, 'fallback')).toBe('fallback');
  });
  it('passes the offline message through', () => {
    expect(rpcErrorMessage(new Error("You're offline. Changes can't be saved until you're back online."), 'f')).toMatch(/offline/);
  });
  it('gives hints for the join failures, and knows which cannot be retried', () => {
    expect(joinHint('Please confirm your email address first.')).toMatch(/confirmation email/);
    expect(joinHint('You already belong to a wedding.')).toMatch(/one wedding/);
    expect(joinHint('something else')).toBeNull();
    expect(isTerminalJoinError('This invite is not valid or has expired.')).toBe(true);
    expect(isTerminalJoinError('Please confirm your email address first.')).toBe(false);
  });
});
