// Fallback/confirmation for a Wedding Planner purchase: the browser calls this
// after Paystack redirects back to /wedding-planner?payment=success&reference=...
// (and may poll it). The charge is re-fetched from Paystack with the secret key
// (GET /transaction/verify/:reference); nothing the browser says is trusted.
// Shares applyPlannerPayment with paystack-webhook, so both paths grant the
// entitlement identically and idempotently (payment_reference UNIQUE).
//
// Request:  POST { reference: string }   (verify_jwt = true)
// Response: 200 { status: "paid" | "already_paid" | "pending" | "failed" | "not_found" }
//           400 { error } bad reference / mismatch / not payable
//           401 not signed in | 403 reference belongs to another user / anonymous
//           409 { error } payment already applied to another account
//
// Deploy: supabase functions deploy wedding-planner-verify --project-ref <ref>
// Secrets required: PAYSTACK_SECRET_KEY, ALLOWED_ORIGIN, RESEND_API_KEY,
// RESEND_FROM_EMAIL (receipt email). SUPABASE_URL, SUPABASE_ANON_KEY and
// SUPABASE_SERVICE_ROLE_KEY are auto-injected.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeadersFor } from "../_shared/cors.ts";
import { userIdFromPlannerReference } from "../_shared/weddingPlanner.ts";
import { applyPlannerPaymentServer } from "../_shared/weddingPlannerServer.ts";

const paystackSecretKey = Deno.env.get("PAYSTACK_SECRET_KEY")!;

// Service role only used after the caller is authenticated and the reference
// is proven to be theirs.
const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

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
    if (user.is_anonymous) return json({ error: "Please sign in with a full account." }, 403);

    const body = await req.json().catch(() => ({}));
    const reference = typeof body.reference === "string" ? body.reference.trim() : "";
    const refUser = userIdFromPlannerReference(reference);
    if (!refUser) return json({ error: "Invalid reference" }, 400);
    if (refUser !== user.id.toLowerCase()) return json({ error: "This reference belongs to another account" }, 403);

    const response = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${paystackSecretKey}` } }
    );
    const result = await response.json().catch(() => ({}));

    if (response.status === 404) return json({ status: "not_found" });
    if (!response.ok || !result.status || !result.data) {
      return json({ error: "Could not reach the payment provider. Please try again." }, 502);
    }

    const txn = result.data;
    if (txn.reference !== reference) return json({ error: "Reference mismatch" }, 400);

    switch (txn.status) {
      case "success":
        break;
      case "failed":
      case "reversed":
        return json({ status: "failed" });
      case "abandoned":
      case "pending":
      case "ongoing":
      case "processing":
      case "queued":
        return json({ status: "pending" });
      default:
        return json({ status: "pending" });
    }

    const applied = await applyPlannerPaymentServer(supabaseAdmin, user.id, txn);
    if (!applied.ok) return json({ error: applied.error }, applied.status);
    return json({ status: applied.alreadyPaid ? "already_paid" : "paid" });
  } catch (error) {
    console.error("wedding-planner-verify failed:", (error as Error).message);
    return json({ error: "Could not verify the payment. Please try again." }, 400);
  }
});
