// Paystack "Standard" hosted-checkout flow: initializes the transaction
// server-side (recomputing the amount from the tier key, never trusting
// the client-supplied amount) and returns an authorization_url — the
// browser just redirects there and back. No client-side Paystack SDK or
// public key needed at all.
//
// Deploy: supabase functions deploy paystack-initialize --project-ref <ref>
// Secrets required (Supabase Dashboard -> Edge Functions -> Secrets, or
// `supabase secrets set`): PAYSTACK_SECRET_KEY, ALLOWED_ORIGIN.
// SUPABASE_URL and SUPABASE_ANON_KEY are auto-injected by Supabase for Edge
// Functions — no need to set them yourself.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeadersFor } from "../_shared/cors.ts";

// Mirror of src/services/pricingTiers.js — keep these two in sync.
// Paystack amounts are in the smallest currency unit (cents for ZAR).
const TIER_AMOUNTS_CENTS: Record<string, number> = {
  starter: 9900, // R99
  growth: 34900, // R349
  unlimited: 99900, // R999 ("Pro" in the UI — key stays `unlimited`)
};

Deno.serve(async (req) => {
  const corsHeaders = corsHeadersFor(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Runs as the calling user (not service role) — forwarding their JWT
    // means auth.uid() and RLS apply normally, so the ownership check below
    // is real enforcement, not just a courtesy check. This also closes off
    // an unauthenticated/anonymous caller from hitting Paystack's API at
    // all: previously this endpoint accepted any eventId/userId the client
    // sent with no verification that the caller actually owned that event,
    // so anyone could trigger a Paystack transaction-initialize call
    // (against arbitrary event/user ids) with nothing but the public anon
    // key.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } }
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { eventId, eventName, tier } = await req.json();
    // userId and email always come from the verified session now, never
    // from the client-supplied body.
    const userId = user.id;
    const email = user.email;

    const amount = TIER_AMOUNTS_CENTS[tier];
    if (!amount) {
      throw new Error(`Unknown or free tier: ${tier}`);
    }
    if (!email) {
      throw new Error("Paystack requires an email to initialize a transaction");
    }

    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id, created_by, is_paid, tier")
      .eq("id", eventId)
      .single();

    // RLS already scopes this select to events the caller owns or has
    // joined, but an explicit ownership check keeps this endpoint from ever
    // initializing a charge tied to an event that isn't the caller's,
    // regardless of what RLS policy exists today or later.
    if (eventError || !event || event.created_by !== userId) {
      return new Response(JSON.stringify({ error: "Event not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (event.is_paid) {
      return new Response(JSON.stringify({ error: "This event is already paid for" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (event.tier !== tier) {
      throw new Error("Tier does not match this event's tier");
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
