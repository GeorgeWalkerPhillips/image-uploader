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

// Fallback for a missed/unresolvable webhook: asks the paystack-verify Edge
// Function to re-check the charge with Paystack and mark the event paid. The
// function authenticates the caller, confirms they own the event and
// re-verifies the amount server-side — the client only supplies identifiers.
// Resolves to { status: 'paid' | 'already_paid', tier }; rejects otherwise.
export const verifyPaystackPayment = async ({ eventId, reference }) => {
  const { data, error } = await supabase.functions.invoke('paystack-verify', {
    body: { eventId, reference },
  });

  if (error) {
    // supabase-js wraps non-2xx in FunctionsHttpError; the real message is
    // in the response body.
    let message = error.message;
    try {
      const body = await error.context?.json();
      if (body?.error) message = body.error;
    } catch (_) {
      // body wasn't JSON — keep the generic message
    }
    throw new Error(message);
  }
  return data;
};

// Deliberately no client-side "record payment" or "mark event paid" here —
// only the Paystack webhook and paystack-verify (server-side, using the
// service role) are allowed to write payment records or mark an event paid.
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
