# Payment System Setup Guide

This app uses **Paystack** for processing payments. (We started with Stripe,
but Stripe doesn't support South African businesses for settlement/payouts —
Paystack is Stripe's own product for the African market and settles ZAR
directly to a South African bank account.) Follow these steps to enable
payments.

## 1. Create a Paystack Account

1. Go to [paystack.com](https://paystack.com) and sign up
2. If you're operating as a sole proprietor (no registered company), choose
   the **Sole Proprietorship** business type during onboarding — this is a
   normal, explicitly-supported path, not a workaround. You'll need: your SA
   ID, a bank confirmation letter (<6 months old), and proof of address
   (<6 months old) — the names on all three must match. Verification takes
   1–3 business days.
3. Complete the compliance/KYC review before going live (test mode works
   immediately without this)

## 2. Get API Keys

1. Go to **Settings → API Keys & Webhooks**
2. You'll see two keys per mode (Test/Live):
   - **Public Key** (starts with `pk_test_`/`pk_live_`) — not used by this
     app at all (see note below)
   - **Secret Key** (starts with `sk_test_`/`sk_live_`) — server-side only

⚠️ **NEVER share the Secret Key! Only use it in Edge Functions, never in
the React app.**

> **Why no public key in the frontend:** this app uses Paystack's "Standard"
> hosted-checkout flow — an Edge Function initializes the transaction
> server-side and returns a URL, and the browser just redirects there and
> back. There's no Paystack JavaScript SDK loaded client-side and no
> `REACT_APP_PAYSTACK_PUBLIC_KEY` needed. (Paystack's alternative "Inline"
> popup flow does use the public key client-side, but we're not using that
> flow here.)

## 3. Update Database Schema

Run, in order, in your Supabase SQL Editor (if you already ran the Stripe
versions of these from an earlier setup, you still need this — the billing
security model doesn't change, only the payment provider):

1. `payment-schema.sql` — payment fields on events, payments table, RLS
   (if not already applied)
2. `security-hardening.sql` — **required**, not optional. This locks
   `events.tier`, `guest_cap`, `photo_cap_per_guest`, `is_paid`, and
   `payment_status` so only the webhook (step 5, using the service role)
   can ever mark an event paid — no client request, however crafted, can
   set these fields itself. Without this file, anyone can open DevTools
   and mark their own event paid for free. This file is fully
   provider-agnostic (it only checks `auth.role() = 'service_role'`) — no
   changes needed even though the payment provider changed.
3. `paystack-migration.sql` — renames a column that was named
   `stripe_payment_intent_id` to the provider-neutral `payment_reference`

## 4. Create the Paystack-Initialize Edge Function (Server-side)

**The code below is illustrative of the original dashboard copy-paste
setup.** The actual, current source is `supabase/functions/paystack-initialize/index.ts`
in this repo (deployed via `supabase functions deploy paystack-initialize`,
per the comment at the top of that file) — it has since diverged from the
snippet below (e.g. it now supports a comma-separated `ALLOWED_ORIGIN` list
for apex+www domains via `_shared/cors.ts`). Treat the repo file as
authoritative; this section is kept for historical setup context.

In Supabase:

1. Go to **Edge Functions** (in left sidebar)
2. Click **Create Function**
3. Name it: `paystack-initialize`
4. Replace the code with:

```javascript
// Set this to your real deployed origin (Settings → Secrets →
// ALLOWED_ORIGIN). Falls back to the known production domain below —
// update both if you add a custom domain. Do NOT use "*" here: that lets
// any website on the internet trigger checkout sessions against your
// Paystack account.
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "https://capture-by-val.vercel.app";

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Mirror of src/services/pricingTiers.js — keep these two in sync. The
// server recomputes the amount from the tier key instead of trusting the
// client-supplied amount, so a tampered request can't pay less than it
// should. Paystack amounts are in the smallest currency unit (cents for
// ZAR), same as Stripe.
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
    const { eventId, eventName, userId, email, tier } = await req.json();

    const amount = TIER_AMOUNTS_CENTS[tier];
    if (!amount) {
      throw new Error(`Unknown or free tier: ${tier}`);
    }
    if (!email) {
      throw new Error("Paystack requires an email to initialize a transaction");
    }

    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("PAYSTACK_SECRET_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        amount,
        currency: "ZAR",
        callback_url: `${req.headers.get("origin")}/admin?payment=success&event=${eventId}`,
        metadata: {
          eventId,
          userId,
          tier,
          eventName,
        },
      }),
    });

    const result = await response.json();

    if (!result.status) {
      throw new Error(result.message || "Paystack initialize failed");
    }

    return new Response(
      JSON.stringify({
        authorization_url: result.data.authorization_url,
        reference: result.data.reference,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
```

The app sends `eventName`/`tier` too but the function above always
recomputes the actual `amount` charged from `tier` alone — never trust a
client-supplied price for what you charge.

5. Click **Deploy**
6. Go to **Settings → Secrets** and add:
   - Key: `PAYSTACK_SECRET_KEY`, Value: your Paystack **Secret Key**
   - Key: `ALLOWED_ORIGIN`, Value: your real production URL(s). CORS needs
     an exact match, so if your site is reachable at more than one hostname
     (e.g. both `valere.co.za` and `www.valere.co.za`), list all of them
     comma-separated with no spaces:
     `https://valere.co.za,https://www.valere.co.za`

## 5. Create the Paystack Webhook (required, not optional)

This is the only thing allowed to mark an event as paid — the DB trigger
from step 3 rejects every other attempt. Without this deployed, **paid
events will never actually confirm**, they'll sit at "payment pending"
forever after a successful Paystack charge.

1. In Supabase: **Edge Functions → Create Function**, name it `paystack-webhook`
2. Replace the code with:

```javascript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const paystackSecretKey = Deno.env.get("PAYSTACK_SECRET_KEY");

// The service role key bypasses RLS entirely — that's intentional and
// safe here because this function only runs after verifying the request
// really came from Paystack (signature check below). Never expose this
// key to the frontend.
const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL"),
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
);

// Mirror of src/services/pricingTiers.js and security-hardening.sql's
// enforce_event_billing_integrity() — keep all three in sync.
const TIER_CONFIG = {
  starter: { guestCap: 25, photoCap: 25 },
  growth: { guestCap: 100, photoCap: 40 },
  unlimited: { guestCap: null, photoCap: null },
};

// Paystack signs webhooks with HMAC-SHA512 of the raw request body, using
// your secret key — there's no separate webhook signing secret like
// Stripe's whsec_. Deno's Web Crypto API (not Node's `crypto` module)
// verifies it.
async function verifyPaystackSignature(rawBody, signatureHeader) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(paystackSecretKey),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"]
  );
  const sigBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
  const computedHex = Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return computedHex === signatureHeader;
}

Deno.serve(async (req) => {
  const signature = req.headers.get("x-paystack-signature");
  const rawBody = await req.text();

  if (!signature || !(await verifyPaystackSignature(rawBody, signature))) {
    console.error("Paystack webhook signature verification failed");
    return new Response("Invalid signature", { status: 400 });
  }

  const event = JSON.parse(rawBody);

  if (event.event === "charge.success") {
    const data = event.data;
    const { eventId, userId, tier } = data.metadata || {};
    const tierConfig = TIER_CONFIG[tier];

    if (!eventId || !tierConfig) {
      console.error("Missing/unknown eventId or tier in transaction metadata:", data.metadata);
      return new Response("Invalid metadata", { status: 400 });
    }

    const { error: updateError } = await supabaseAdmin
      .from("events")
      .update({
        is_paid: true,
        payment_status: "completed",
        paid_at: new Date().toISOString(),
        guest_cap: tierConfig.guestCap,
        photo_cap_per_guest: tierConfig.photoCap,
      })
      .eq("id", eventId);

    if (updateError) {
      console.error("Failed to mark event paid:", updateError);
      return new Response("Database update failed", { status: 500 });
    }

    // payment_reference has a UNIQUE constraint — if Paystack retries the
    // same webhook delivery, this insert fails harmlessly the second time
    // instead of double-processing.
    const { error: paymentError } = await supabaseAdmin.from("payments").insert({
      event_id: eventId,
      user_id: userId,
      payment_reference: data.reference,
      amount_cents: data.amount,
      currency: (data.currency || "ZAR").toUpperCase(),
      status: "succeeded",
      metadata: { tier },
    });

    if (paymentError && paymentError.code !== "23505") {
      // 23505 = unique_violation (duplicate webhook delivery) — expected
      // and fine to ignore. Anything else is worth knowing about, though
      // the event is already marked paid at this point either way.
      console.error("Failed to record payment:", paymentError);
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
});
```

3. Click **Deploy**
4. Go to **Settings → Secrets** and confirm `SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY` are present (Supabase usually injects these
   automatically for Edge Functions — if not, add them from **Settings →
   API**)
5. In the **Paystack Dashboard**: **Settings → API Keys & Webhooks**
   - Webhook URL: `https://<your-project-ref>.supabase.co/functions/v1/paystack-webhook`
   - Save. Paystack automatically sends `charge.success` (and other events,
     which this function ignores) to this URL — there's no separate
     "select events" step or signing-secret exchange like Stripe's; the
     signature is always computed from your Secret Key.

## 6. Testing

### Test in Development:

1. User creates event
2. Selects a paid plan (Starter, Growth, or Unlimited)
3. Redirected to Paystack's hosted test checkout page
4. Use a [Paystack test card](https://paystack.com/docs/payments/test-payments/)
5. On return, the app polls the event for a few seconds waiting for the
   webhook to confirm it — you should see "Payment confirmed!" within
   ~10s. If it times out, check **Paystack Dashboard → Transactions**
   and **Settings → API Keys & Webhooks → webhook logs** for the actual
   error.

### Test Cards:

- **Successful**: `4084 0840 8408 4081`, any future expiry, CVV `408`,
  PIN `0000`, OTP `123456`
- See [Paystack's test cards page](https://paystack.com/docs/payments/test-payments/)
  for declined-card and other scenarios — they're region/card-type specific.

## 7. Go Live

When ready for real payments:

1. Complete Paystack's compliance/KYC review (required before Live Mode
   API calls work at all)
2. Switch **Settings → API Keys & Webhooks** to **Live** mode, get live keys
3. Update the `PAYSTACK_SECRET_KEY` secret on **both** Edge Functions
4. Re-register the webhook URL under Live mode settings (test and live
   webhooks are configured separately)
5. Test again with a small real transaction before announcing

## Pricing

Priced by guest count, matching how competitors like POV Camera price
(free under 10 guests, then flat one-time fees that scale with guest
count — no subscriptions):

- **Free**: up to 10 guests
- **Starter**: R99/event, up to 25 guests
- **Growth**: R349/event, up to 100 guests
- **Unlimited**: R899/event, no guest cap

Edit pricing in `src/services/pricingTiers.js` — and keep the
`TIER_AMOUNTS_CENTS` map in the Edge Function (step 4 above) in sync, since
that's what actually determines what Paystack charges.

## Troubleshooting

**Payment not processing?**
- Check the Paystack Secret Key is correct and for the right mode (test
  vs. live)
- Verify both Edge Functions (`paystack-initialize` and
  `paystack-webhook`) are deployed
- Check browser console for errors
- Look at **Paystack Dashboard → Transactions** for failures

**Events stuck on "payment pending"?**
- This means the webhook hasn't fired/succeeded — check the webhook logs
  in **Paystack Dashboard → Settings → API Keys & Webhooks**
- There is deliberately no manual "just flip `is_paid = true`" escape
  hatch anymore — `security-hardening.sql` blocks that for everyone except
  the service role, which is the whole point. If you need to manually
  comp an event, do it from the Supabase SQL Editor using the **service
  role** connection (not the table editor's default role), or temporarily
  disable `trg_enforce_event_billing_integrity`.

**Currency showing wrong?**
- Paystack expects amounts in the smallest currency unit (R50 = 5000 cents)
- All amounts are in ZAR

## Security

✅ Secret Key never exposed to frontend — and unlike Stripe, there isn't
   even a public key in the frontend at all, since this app uses the
   hosted-redirect flow, not Paystack's client-side Inline popup
✅ Charge amount is recomputed server-side from the tier key, not trusted from the client
✅ Only the Paystack webhook (HMAC-SHA512 signature verified, service
   role) can mark an event paid or write a payment record — enforced by a
   DB trigger, not just app logic, so it can't be bypassed by calling the
   REST API directly
✅ CORS on both Edge Functions is locked to your real origin, not `*`
✅ Duplicate webhook deliveries can't double-process a payment (`payment_reference` has a UNIQUE constraint)

This closes the gap flagged in earlier reviews: previously the app
confirmed payment by reading `?payment=success` off the redirect URL and
writing `is_paid = true` directly from the client — which anyone could
trigger by hand-editing the URL, no payment required. That path no longer
exists; `security-hardening.sql` rejects any non-webhook attempt to change
billing fields at the database level, regardless of what the frontend code
does or doesn't check.

---

**Need help?**
- Paystack Docs: https://paystack.com/docs
- Paystack Standard (hosted checkout) integration: https://paystack.com/docs/payments/accept-payments/#standard
- Paystack Webhooks: https://paystack.com/docs/payments/webhooks/
- Supabase Edge Functions: https://supabase.com/docs/guides/functions
