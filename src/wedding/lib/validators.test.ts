import { emptyTargetForm, validateTarget, validateWedding } from './validators';
import type { TargetFormValues, WeddingFormValues } from './validators';
import { isoToJhbParts, jhbPartsToISO } from './jhb';

const base = (over: Partial<TargetFormValues>): TargetFormValues => ({ ...emptyTargetForm, ...over });

describe('validateTarget', () => {
  it('requires a title', () => {
    const r = validateTarget(base({ targetAmount: '100' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.title).toBeDefined();
  });

  it('requires an amount for amount targets', () => {
    const r = validateTarget(base({ title: 'x' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.targetAmount).toBeDefined();
  });

  it('rejects garbage and negative amounts', () => {
    expect(validateTarget(base({ title: 'x', targetAmount: 'abc' })).ok).toBe(false);
    expect(validateTarget(base({ title: 'x', targetAmount: '-5' })).ok).toBe(false);
  });

  it('builds a manual amount payload', () => {
    const r = validateTarget(base({ title: ' Save ', targetAmount: 'R15 000,50', currentAmount: '200' }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toMatchObject({
        title: 'Save',
        kind: 'amount',
        metric: 'manual',
        category_id: null,
        target_cents: 1500050,
        current_cents: 20000,
        target_at: null,
        notes: null,
      });
    }
  });

  it('requires a category for category metrics and keeps it', () => {
    const missing = validateTarget(base({ title: 'x', targetAmount: '100', metric: 'category_paid' }));
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.errors.categoryId).toBeDefined();
    const ok = validateTarget(
      base({ title: 'x', targetAmount: '100', metric: 'category_paid', categoryId: 'c1', currentAmount: '50' })
    );
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.value.category_id).toBe('c1');
  });

  it('drops the category and current amount for non-manual, non-category metrics', () => {
    const r = validateTarget(
      base({ title: 'x', targetAmount: '100', metric: 'paid_total', categoryId: 'c1', currentAmount: '50' })
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.category_id).toBeNull();
      expect(r.value.current_cents).toBe(0);
    }
  });

  it('requires a date for date targets and forces manual metric', () => {
    expect(validateTarget(base({ title: 'x', kind: 'date' })).ok).toBe(false);
    const r = validateTarget(
      base({ title: 'x', kind: 'date', metric: 'category_paid', categoryId: 'c1', targetDate: '2027-03-06', targetTime: '14:30' })
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.metric).toBe('manual');
      expect(r.value.category_id).toBeNull();
      expect(r.value.target_cents).toBeNull();
      expect(r.value.target_at).toBe('2027-03-06T12:30:00.000Z');
    }
  });
});

describe('amount target deadline', () => {
  const amount = { title: 'x', targetAmount: '100', targetDate: '2027-03-06', targetTime: '14:30' };
  it('keeps the deadline for savings goals', () => {
    const r = validateTarget(base({ ...amount, scope: 'savings' }));
    expect(r.ok && r.value.target_at).toBe('2027-03-06T12:30:00.000Z');
  });
  it('drops a stale hidden deadline for other scopes', () => {
    const r = validateTarget(base({ ...amount, scope: 'wedding' }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.target_at).toBeNull();
  });
});

describe('jhb parts', () => {
  it('round-trips', () => {
    const iso = jhbPartsToISO('2027-03-06', '14:30');
    expect(iso).toBe('2027-03-06T12:30:00.000Z');
    expect(isoToJhbParts(iso)).toEqual({ date: '2027-03-06', time: '14:30' });
  });
  it('handles midnight rollover and bad input', () => {
    expect(isoToJhbParts('2027-03-05T22:30:00Z')).toEqual({ date: '2027-03-06', time: '00:30' });
    expect(isoToJhbParts(null)).toEqual({ date: '', time: '' });
    expect(jhbPartsToISO('nope', '10:00')).toBeNull();
  });
});

const w = (over: Partial<WeddingFormValues>): WeddingFormValues => ({
  name: 'Us',
  weddingDate: '2027-03-06',
  weddingTime: '15:00',
  venue: '',
  guestCount: '',
  budget: '',
  honeymoonBudget: '',
  honeymoonStart: '',
  honeymoonDays: '',
  fx: '',
  ...over,
});

describe('validateWedding', () => {
  it('accepts a minimal form', () => {
    const r = validateWedding(w({}));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.budget_cents).toBe(0);
      expect(r.value.venue).toBeNull();
      expect(r.value.wedding_date).toBe('2027-03-06T13:00:00.000Z');
    }
  });
  it('parses all fields', () => {
    const r = validateWedding(
      w({ venue: ' Hall ', guestCount: '80', budget: '250 000', honeymoonBudget: '60000', honeymoonStart: '2027-03-08', honeymoonDays: '14', fx: '1,85' })
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toMatchObject({
        venue: 'Hall',
        guest_count: 80,
        budget_cents: 25000000,
        honeymoon_budget_cents: 6000000,
        honeymoon_start: '2027-03-08',
        honeymoon_days: 14,
        fx_thb_per_zar: 1.85,
      });
    }
  });
  it('flags invalid values', () => {
    const r = validateWedding(
      w({ name: ' ', weddingDate: '', guestCount: '-2', budget: 'x', honeymoonDays: '120', fx: '0' })
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(Object.keys(r.errors).sort()).toEqual(
        ['budget', 'fx', 'guestCount', 'honeymoonDays', 'name', 'weddingDate'].sort()
      );
    }
  });
});
