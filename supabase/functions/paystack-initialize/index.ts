// Paystack "Standard" hosted-checkout flow: initializes the transaction
// server-side (recomputing the amount from the tier key, never trusting
// the client-supplied amount) and returns an authorization_url — the
// browser just redirects there and back. No client-side Paystack SDK or
// public key needed at all.
//
// Deploy: supabase functions deploy paystack-initialize --project-ref <ref>
// Secrets required (Supabase Dashboard -> Edge Functions -> Secrets, or
// `supabase secrets set`): PAYSTACK_SECRET_KEY, ALLOWED_ORIGIN

import { corsHeadersFor } from "../_shared/cors.ts";

// Mirror of src/services/pricingTiers.js — keep these two in sync.
// Paystack amounts are in the smallest currency unit (cents for ZAR).
const TIER_AMOUNTS_CENTS: Record<string, number> = {
  starter: 9900, // R99
  growth: 34900, // R349
  unlimited: 89900, // R899
};

Deno.serve(async (req) => {
  const corsHeaders = corsHeadersFor(req);

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
