// Pure pricing data — safe to import anywhere (landing page, pricing modal,
// admin dashboard) without pulling in Paystack or any other side effects.
//
// Guest-count-based tiers, priced to be directly competitive with POV
// Camera (free under 10 guests; $4.99 / $19.99 / $49.99 paid tiers by
// guest count, one-time per event, no subscription).
export const TIERS = {
  free: {
    key: 'free',
    name: 'Free',
    guestCap: 10,
    photosPerGuest: 15,
    amountCents: 0,
    display: 'Free',
  },
  starter: {
    key: 'starter',
    name: 'Starter',
    guestCap: 25,
    photosPerGuest: 25,
    amountCents: 9900, // R99
    display: 'R99',
  },
  growth: {
    key: 'growth',
    name: 'Growth',
    guestCap: 100,
    photosPerGuest: 40,
    amountCents: 34900, // R349
    display: 'R349',
  },
  unlimited: {
    key: 'unlimited',
    // Internal key stays "unlimited" (touches too many places to safely
    // rename), but the tier is no longer actually uncapped — a single
    // very large event on a truly unlimited plan could cost far more in
    // ongoing storage than its one-time fee ever recovers. 500 guests /
    // 50 photos each is generous enough to cover virtually every real
    // event while bounding that risk.
    name: 'Pro',
    guestCap: 500,
    photosPerGuest: 50,
    amountCents: 99900, // R999
    display: 'R999',
  },
};

export const TIER_ORDER = ['free', 'starter', 'growth', 'unlimited'];

export const formatGuestCap = (guestCap) =>
  guestCap == null ? 'Unlimited guests' : `Up to ${guestCap} guests`;

export const formatPhotoCap = (photosPerGuest) =>
  photosPerGuest == null ? 'Unlimited photos per guest' : `${photosPerGuest} photos per guest`;

export const formatPrice = (amountCents, currency = 'ZAR') => {
  return (amountCents / 100).toLocaleString('en-ZA', {
    style: 'currency',
    currency: currency,
  });
};
