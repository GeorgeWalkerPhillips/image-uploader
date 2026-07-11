import { supabase } from '../supabaseClient';

// Paystack's "Standard" hosted-checkout flow: an Edge Function initializes
// the transaction server-side (with a server-validated amount, never
// trusting the client) and returns an authorization_url — the browser just
// redirects there and back. No client-side Paystack SDK/public key needed
// at all, unlike Stripe.js.
export const initializePaystackTransaction = async (eventId, eventName, userId, userEmail, tierKey) => {
  try {
    const { data, error } = await supabase.functions.invoke('paystack-initialize', {
      body: {
        eventId,
        eventName,
        userId,
        email: userEmail,
        tier: tierKey,
      },
    });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Paystack initialize error:', error);
    throw new Error('Failed to start payment');
  }
};

// Deliberately no client-side "record payment" or "mark event paid" here —
// only the Paystack webhook (server-side, signature verified, using the
// service role) is allowed to write payment records or mark an event paid.
// A DB trigger rejects any other attempt. See security-hardening.sql and
// the paystack-webhook Edge Function in PAYMENT_SETUP.md.

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
