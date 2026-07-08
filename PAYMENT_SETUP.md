# Payment System Setup Guide

This app uses **Stripe** for processing payments. Follow these steps to enable payments.

## 1. Create Stripe Account

1. Go to [stripe.com](https://stripe.com)
2. Sign up for a free account
3. Complete your business information (Stripe will ask for basic details)
4. Verify your email

## 2. Get API Keys

1. Go to **Dashboard → Developers → API Keys**
2. You'll see two keys:
   - **Publishable Key** (starts with `pk_test_` for testing)
   - **Secret Key** (starts with `sk_test_` for testing)

⚠️ **NEVER share the Secret Key! Only use in backend!**

## 3. Add to Environment

Create `.env.local` in your project root and add:

```
REACT_APP_SUPABASE_URL=your_supabase_url
REACT_APP_SUPABASE_ANON_KEY=your_anon_key
REACT_APP_STRIPE_PUBLIC_KEY=pk_test_your_publishable_key
```

Only the **Publishable Key** goes in `.env.local` (it's safe for frontend).

## 4. Update Database Schema

Run the SQL from `payment-schema.sql` in your Supabase SQL Editor:

```sql
-- Copy entire contents of payment-schema.sql
-- Paste into Supabase SQL Editor
-- Click Run
```

This creates:
- Payment fields on events table
- Payments table for transaction history
- User subscriptions table (for future)
- Row-level security policies

## 5. Create Supabase Edge Function (Server-side)

You need a serverless function to handle checkout. In Supabase:

1. Go to **Edge Functions** (in left sidebar)
2. Click **Create Function**
3. Name it: `create-checkout-session`
4. Replace the code with:

```javascript
import Stripe from "https://esm.sh/stripe@14.0.0";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"));

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Mirror of src/services/pricingTiers.js — keep these two in sync. The
// server recomputes the amount from the tier key instead of trusting the
// client-supplied amount, so a tampered request can't pay less than it
// should.
const TIER_AMOUNTS_CENTS = {
  starter: 9900, // R99
  growth: 34900, // R349
  unlimited: 89900, // R899
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { eventId, eventName, userId, tier } = await req.json();

    const amount = TIER_AMOUNTS_CENTS[tier];
    if (!amount) {
      throw new Error(`Unknown or free tier: ${tier}`);
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "zar",
            product_data: {
              name: `Event: ${eventName} (${tier})`,
              description: "Event photo sharing",
            },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${req.headers.get("origin")}/admin?payment=success&event=${eventId}`,
      cancel_url: `${req.headers.get("origin")}/admin?payment=cancelled`,
      metadata: {
        eventId,
        userId,
        tier,
      },
    });

    return new Response(JSON.stringify({ sessionId: session.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
```

The app currently sends `amount` too (for its own display purposes) but the
function above ignores it and always recomputes from `tier` — never trust
a client-supplied price for what you charge.

5. Click **Deploy**
6. Go to **Settings → Secrets** and add:
   - Key: `STRIPE_SECRET_KEY`
   - Value: Your Stripe **Secret Key** (from API Keys)

## 6. Set Stripe Webhook (Optional but Recommended)

For production, add a webhook to auto-confirm payments:

1. In Stripe Dashboard: **Developers → Webhooks**
2. Click **Add Endpoint**
3. Endpoint URL: `https://your-project.supabase.co/functions/v1/webhook-stripe`
4. Events to send:
   - `payment_intent.succeeded`
   - `charge.refunded`

Create a new Edge Function `webhook-stripe` to handle the webhook.

## 7. Testing

### Test in Development:

1. User creates event
2. Selects a paid plan (Starter, Growth, or Unlimited)
3. Redirected to Stripe test checkout
4. Use test card: `4242 4242 4242 4242`
5. Any future date, any CVC
6. On return, the app reads `?payment=success` from the redirect URL and
   marks the event paid client-side (see "Security" below for the caveat)

### Test Cards:

- **Successful**: `4242 4242 4242 4242`
- **Declined**: `4000 0000 0000 0002`
- **3D Secure**: `4000 0025 0000 3155`

## 8. Go Live

When ready for real payments:

1. In Stripe: Switch from **Test Mode** to **Live Mode**
2. Get live API keys (start with `pk_live_`)
3. Update environment variables
4. Update Supabase secrets with live secret key
5. Test again with small transaction

## Pricing

Priced by guest count, matching how competitors like POV Camera price
(free under 10 guests, then flat one-time fees that scale with guest
count — no subscriptions):

- **Free**: up to 10 guests
- **Starter**: R99/event, up to 25 guests
- **Growth**: R349/event, up to 100 guests
- **Unlimited**: R899/event, no guest cap

Edit pricing in `src/services/pricingTiers.js` — and keep the
`TIER_AMOUNTS_CENTS` map in the Edge Function (step 5 above) in sync, since
that's what actually determines what Stripe charges.

## Troubleshooting

**Payment not processing?**
- Check Stripe API keys are correct
- Verify Edge Function is deployed
- Check browser console for errors
- Look at Stripe Dashboard → Events for failures

**Events not marked as paid?**
- Webhook may not be configured
- Manual update: In Supabase, update event `is_paid = true`

**Currency showing wrong?**
- Stripe expects amounts in cents (R50 = 5000 cents)
- All amounts are in ZAR

## Security

✅ Secret Key never exposed to frontend
✅ Charge amount is recomputed server-side from the tier key, not trusted from the client
✅ RLS policies protect payment data
⚠️ **No webhook is deployed yet.** The app currently confirms payment by
reading `?payment=success` off the Stripe redirect URL when the browser
returns to `/admin` — this proves the user completed *a* checkout, but
doesn't cryptographically verify it with Stripe. A user who cancels but
manually edits the URL to add `?payment=success&event=<id>` could mark an
unpaid event as paid. For real production hardening, build the
`webhook-stripe` function from step 6 and verify
`stripe-signature` against `payment_intent.succeeded` before calling
`updateEventPaymentStatus`.

---

**Need help?**
- Stripe Docs: https://stripe.com/docs
- Supabase Edge Functions: https://supabase.com/docs/guides/functions
