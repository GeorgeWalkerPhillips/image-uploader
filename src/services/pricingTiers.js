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
    key: 'unlimited',
    name: 'The Whole Reel',
    guestCap: null,
    photosPerGuest: null,
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
