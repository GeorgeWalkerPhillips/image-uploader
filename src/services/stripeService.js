import { supabase } from '../supabaseClient';

const stripePromise = new Promise((resolve) => {
  const script = document.createElement('script');
  script.src = 'https://js.stripe.com/v3/';
  script.onload = () => {
    resolve(window.Stripe(process.env.REACT_APP_STRIPE_PUBLIC_KEY));
  };
  document.head.appendChild(script);
});

export const getStripe = () => stripePromise;

export const createCheckoutSession = async (eventId, eventName, userId, amount, tierKey) => {
  try {
    const { data: session, error } = await supabase.functions.invoke(
      'create-checkout-session',
      {
        body: {
          eventId,
          eventName,
          userId,
          amount,
          tier: tierKey,
        },
      }
    );

    if (error) throw error;
    return session;
  } catch (error) {
    console.error('Checkout session error:', error);
    throw new Error('Failed to create checkout session');
  }
};

export const recordPayment = async (eventId, stripePaymentIntentId, amount, status) => {
  try {
    const { data, error } = await supabase
      .from('payments')
      .insert({
        event_id: eventId,
        user_id: (await supabase.auth.getUser()).data.user.id,
        stripe_payment_intent_id: stripePaymentIntentId,
        amount_cents: amount,
        currency: 'ZAR',
        status: status,
      });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Payment record error:', error);
    throw error;
  }
};

export const updateEventPaymentStatus = async (eventId, isPaid) => {
  try {
    const { error } = await supabase
      .from('events')
      .update({
        is_paid: isPaid,
        payment_status: isPaid ? 'completed' : 'pending',
        paid_at: isPaid ? new Date().toISOString() : null,
      })
      .eq('id', eventId);

    if (error) throw error;
  } catch (error) {
    console.error('Event update error:', error);
    throw error;
  }
};

export const getPaymentHistory = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Payment history error:', error);
    return [];
  }
};

export const getEventPaymentStatus = async (eventId) => {
  try {
    const { data, error } = await supabase
      .from('events')
      .select('is_paid, is_free, payment_status')
      .eq('id', eventId)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Payment status error:', error);
    return null;
  }
};

// Guest-count-based tiers, priced to be directly competitive with POV
// Camera (free under 10 guests; $4.99 / $19.99 / $49.99 paid tiers by
// guest count, one-time per event, no subscription).
export const TIERS = {
  free: {
    key: 'free',
    name: 'Free',
    guestCap: 10,
    amountCents: 0,
    display: 'Free',
  },
  starter: {
    key: 'starter',
    name: 'Starter',
    guestCap: 25,
    amountCents: 9900, // R99
    display: 'R99',
  },
  growth: {
    key: 'growth',
    name: 'Growth',
    guestCap: 100,
    amountCents: 34900, // R349
    display: 'R349',
  },
  unlimited: {
    key: 'unlimited',
    name: 'Unlimited',
    guestCap: null,
    amountCents: 89900, // R899
    display: 'R899',
  },
};

export const TIER_ORDER = ['free', 'starter', 'growth', 'unlimited'];

export const formatGuestCap = (guestCap) =>
  guestCap == null ? 'Unlimited guests' : `Up to ${guestCap} guests`;

export const formatPrice = (amountCents, currency = 'ZAR') => {
  return (amountCents / 100).toLocaleString('en-ZA', {
    style: 'currency',
    currency: currency,
  });
};
