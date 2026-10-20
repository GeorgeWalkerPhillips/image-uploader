import {
  TIERS,
  TIER_ORDER,
  WEDDING_PLANNER,
  tierIncludesWeddingPlanner,
  weddingPlannerIncludedLine,
} from './pricingTiers';

describe('Wedding Planner price', () => {
  it('is R199 one-time in ZAR cents', () => {
    expect(WEDDING_PLANNER.amountCents).toBe(19900);
    expect(WEDDING_PLANNER.currency).toBe('ZAR');
  });
});

describe('Wedding Planner included with a tier', () => {
  it('is included only with the unlimited tier', () => {
    expect(TIER_ORDER.filter(tierIncludesWeddingPlanner)).toEqual(['unlimited']);
    expect(tierIncludesWeddingPlanner('nope')).toBe(false);
  });

  it('produces a feature line with the value from the constant, only for unlimited', () => {
    expect(weddingPlannerIncludedLine('unlimited')).toBe('Wedding Planner included (worth R199)');
    ['free', 'starter', 'growth'].forEach((k) => expect(weddingPlannerIncludedLine(k)).toBeNull());
  });

  it('does not change tier prices or caps', () => {
    expect(TIERS.unlimited.amountCents).toBe(99900);
    expect(TIERS.unlimited.guestCap).toBe(500);
    expect(TIERS.unlimited.photosPerGuest).toBe(50);
  });
});
