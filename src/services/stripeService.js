import { loadStripe } from '@stripe/js';
import { supabase } from '../supabaseClient';

const stripePromise = loadStripe(process.env.REACT_APP_STRIPE_PUBLIC_KEY);

export const getStripe = () => stripePromise;

export const createCheckoutSession = async (eventId, eventName, userId, amount = 5000) => {
  try {
    const { data: session, error } = await supabase.functions.invoke(
      'create-checkout-session',
      {
        body: {
          eventId,
          eventName,
          userId,
          amount,
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

// Pricing constants
export const PRICING = {
  ZAR: {
    amount_cents: 5000, // R50
    display: 'R50',
    currency: 'ZAR',
  },
  FREE_EVENTS_PER_USER: 1,
};

export const formatPrice = (amountCents, currency = 'ZAR') => {
  return (amountCents / 100).toLocaleString('en-ZA', {
    style: 'currency',
    currency: currency,
  });
};
