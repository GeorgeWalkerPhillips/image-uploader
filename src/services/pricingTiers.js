// Pure pricing data — safe to import anywhere (landing page, pricing modal,
// admin dashboard) without pulling in Paystack or any other side effects.
//
// Guest-count-based tiers, one-time per event, no subscription. The object
// keys (free/starter/growth/unlimited) are stable identifiers stored on
// events.tier and referenced by the Edge Functions and DB triggers — only
// the display `name`/`display` and the caps/amount change when pricing is
// reworked, never the keys.
export const TIERS = {
  free: {
    key: 'free',
    name: 'Taster',
    guestCap: 5,
    photosPerGuest: 5,
    amountCents: 0,
    display: 'Free',
  },
  starter: {
    key: 'starter',
    name: 'Gathering',
    guestCap: 25,
    photosPerGuest: 15,
    amountCents: 17900, // R179
    display: 'R179',
  },
  growth: {
    key: 'growth',
    name: 'Big Day',
    guestCap: 50,
    photosPerGuest: 25,
    amountCents: 39900, // R399
    display: 'R399',
  },
  unlimited: {
    // Internal key stays "unlimited" (it's stored on events.tier and
    // referenced by every CASE statement in the billing triggers —
    // renaming it would need a data migration). The tier itself is not
    // actually uncapped: a single very large event could cost far more in
    // ongoing storage than its one-time fee recovers, so it's bounded at
    // 500 guests / 50 photos each — generous enough for virtually every
    // real event.
    key: 'unlimited',
    name: 'The Whole Reel',
    guestCap: 500,
    photosPerGuest: 50,
    amountCents: 99900, // R999
    display: 'R999',
    // The Wedding Planner is included free with this tier. Display only: the
    // server grants the entitlement when the event is paid, not the client.
    includesWeddingPlanner: true,
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

// The Wedding Planner add-on (Wedding HQ, sold separately from the photo
// tiers above): a single one-time purchase per wedding. This is display
// data only — the charged amount is recomputed server-side. KEEP IN SYNC
// with the server constant in supabase/functions/_shared/weddingPlanner.ts.
export const WEDDING_PLANNER = {
  name: 'Wedding Planner',
  amountCents: 19900, // R199, one-time
  currency: 'ZAR',
};

// Does this tier include the Wedding Planner at no extra cost?
export const tierIncludesWeddingPlanner = (tierKey) =>
  TIERS[tierKey]?.includesWeddingPlanner === true;

// Feature-list line for tiers that include the planner, e.g.
// "Wedding Planner included (worth R199)". Null for all other tiers.
export const weddingPlannerIncludedLine = (tierKey) =>
  tierIncludesWeddingPlanner(tierKey)
    ? `${WEDDING_PLANNER.name} included (worth ${formatPrice(WEDDING_PLANNER.amountCents, WEDDING_PLANNER.currency).replace(/[\s\u00a0]/g, '').replace(/[,.]00$/, '')})`
    : null;
