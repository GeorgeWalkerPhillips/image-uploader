// Starts a Wedding Planner purchase (Paystack hosted checkout, same flow as
// paystack-initialize). POST, no body needed. Returns { checkoutUrl, reference }.
//
// The caller is authenticated with their own JWT (anon client + Authorization
// header). Anonymous guest sessions are refused. The amount comes ONLY from the
// server constant WEDDING_PLANNER (_shared/weddingPlanner.ts), never the body.
// A user who already holds the planner (paid or grandfathered) gets 409.
//
// Request:  POST  (verify_jwt = true), Authorization: Bearer <user JWT>
// Response: 200 { checkoutUrl, reference }
//           401 { error } not signed in | 403 { error } anonymous user
//           409 { error: "You already have the Wedding Planner." }
//           400/502 { error } Paystack / config problems
//
// Deploy: supabase functions deploy wedding-planner-checkout --project-ref <ref>
// Secrets required: PAYSTACK_SECRET_KEY, ALLOWED_ORIGIN (CORS + return URL;
// fallback https://valere.co.za). SUPABASE_URL and SUPABASE_ANON_KEY are
// auto-injected.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeadersFor } from "../_shared/cors.ts";
import { buildInitializePayload, checkoutOriginFrom } from "../_shared/weddingPlanner.ts";

Deno.serve(async (req) => {
  const corsHeaders = corsHeadersFor(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json({ error: "Not authenticated" }, 401);
    if (user.is_anonymous) {
      return json({ error: "Please sign in with a full account to buy the Wedding Planner." }, 403);
    }
    if (!user.email) return json({ error: "Your account needs an email address to pay." }, 400);

    // Runs as the caller: RLS (select-own) scopes this to their own row.
    const { data: existing, error: entError } = await supabase
      .from("wedding_planner_entitlements")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (entError) {
      console.error("wedding-planner-checkout entitlement lookup failed:", entError.code);
      return json({ error: "Could not start checkout. Please try again." }, 502);
    }
    if (existing) return json({ error: "You already have the Wedding Planner." }, 409);

    const origin = checkoutOriginFrom(req.headers.get("origin"), Deno.env.get("ALLOWED_ORIGIN"));
    const payload = buildInitializePayload({ id: user.id, email: user.email }, origin);

    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("PAYSTACK_SECRET_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));

    if (!result.status || !result.data?.authorization_url) {
      console.error("wedding-planner-checkout: Paystack initialize failed", response.status);
      return json({ error: "Could not start checkout. Please try again." }, 502);
    }

    return json({ checkoutUrl: result.data.authorization_url, reference: payload.reference });
  } catch (error) {
    console.error("wedding-planner-checkout failed:", (error as Error).message);
    return json({ error: "Could not start checkout. Please try again." }, 400);
  }
});
