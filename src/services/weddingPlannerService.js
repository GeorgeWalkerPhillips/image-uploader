import { supabase } from '../supabaseClient';

// Wedding Planner purchase flow. Same hosted-checkout pattern as
// paystackService.js: the Edge Function decides the amount server-side and
// returns a Paystack URL; the browser only redirects there and back. Nothing
// here can grant access — entitlement is written by the server after the
// payment is confirmed (webhook / wedding-planner-verify).

export const NO_PLANNER_STATUS = Object.freeze({
  entitled: false,
  wedding_id: null,
  access: null,
  role: null,
});

// supabase-js wraps non-2xx Edge Function responses; the useful message is in
// the response body.
const functionError = async (error, fallback) => {
  let message = fallback;
  try {
    const body = await error.context?.json();
    if (body?.error) message = body.error;
  } catch (_) {
    // body wasn't JSON — keep the fallback
  }
  return new Error(message);
};

export const startCheckout = async () => {
  const { data, error } = await supabase.functions.invoke('wedding-planner-checkout', {
    body: {},
  });
  if (error) throw await functionError(error, 'Could not start checkout. Please try again.');

  const url = data?.checkoutUrl;
  if (data?.error || typeof url !== 'string' || !url.startsWith('https://')) {
    throw new Error(data?.error || 'Could not start checkout. Please try again.');
  }
  window.location.assign(url);
  return url;
};

// Resolves to { status: 'paid'|'already_paid'|'pending'|'failed'|'not_found' }.
// Rejects on transport errors so the caller can retry.
export const verifyPurchase = async (reference) => {
  const { data, error } = await supabase.functions.invoke('wedding-planner-verify', {
    body: { reference },
  });
  if (error) throw await functionError(error, 'Could not confirm your payment.');
  if (!data?.status) throw new Error(data?.error || 'Could not confirm your payment.');
  return data;
};

// Fails closed and quietly: any error, anonymous caller or malformed reply
// is "not entitled". The RPC is the source of truth either way.
export const getPlannerStatus = async () => {
  try {
    const { data, error } = await supabase.rpc('my_wedding_planner_status');
    if (error) return NO_PLANNER_STATUS;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row !== 'object') return NO_PLANNER_STATUS;
    return {
      entitled: row.entitled === true,
      wedding_id: row.wedding_id ?? null,
      access: row.access === 'partner' || row.access === 'collaborator' ? row.access : null,
      role: row.role ?? null,
    };
  } catch {
    return NO_PLANNER_STATUS;
  }
};
