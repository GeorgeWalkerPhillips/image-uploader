// Fallback for when the Paystack webhook never lands or can't tell which
// event a charge belongs to. The browser calls this after Paystack redirects
// back to /admin?payment=success&event=<id>&reference=<ref>. We don't trust
// the browser: the charge is re-fetched from Paystack with the secret key
// (GET /transaction/verify/:reference), and the caller must own the event.
// The actual "mark paid" logic is shared with paystack-webhook
// (_shared/paystackPayment.ts), so the two paths can't drift apart, and it
// is idempotent via the payments.payment_reference UNIQUE constraint — safe
// to call repeatedly, or after the webhook has already succeeded.
//
// Body: { reference?: string, eventId?: string } (at least one).
//   - reference: verified directly.
//   - eventId only: looks through the caller's recent successful Paystack
//     charges for one that matches this event's tier price.
//
// Deploy: supabase functions deploy paystack-verify --project-ref <ref>
// Secrets required: PAYSTACK_SECRET_KEY, ALLOWED_ORIGIN, RESEND_API_KEY,
// RESEND_FROM_EMAIL (receipt email). SUPABASE_URL, SUPABASE_ANON_KEY and
// SUPABASE_SERVICE_ROLE_KEY are auto-injected.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeadersFor } from "../_shared/cors.ts";
import {
  TIER_CONFIG,
  applyPaystackPayment,
  eventIdFromTransaction,
} from "../_shared/paystackPayment.ts";

const paystackSecretKey = Deno.env.get("PAYSTACK_SECRET_KEY")!;

// The service role is only used after the caller is authenticated and has
// been confirmed to own the event below.
const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// deno-lint-ignore no-explicit-any
type Txn = any;

async function paystackGet(path: string) {
  const response = await fetch(`https://api.paystack.co${path}`, {
    headers: { Authorization: `Bearer ${paystackSecretKey}` },
  });
  return { httpStatus: response.status, body: await response.json().catch(() => ({})) };
}

const sameEmail = (a: unknown, b: unknown) =>
  typeof a === "string" && typeof b === "string" && a.trim().toLowerCase() === b.trim().toLowerCase();

Deno.serve(async (req) => {
  const corsHeaders = corsHeadersFor(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } }
    );
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) return json({ error: "Not authenticated" }, 401);

    const body = await req.json().catch(() => ({}));
    const reference = typeof body.reference === "string" ? body.reference.trim() : "";
    const requestedEventId = typeof body.eventId === "string" ? body.eventId.trim() : "";
    if (!reference && !requestedEventId) {
      return json({ error: "reference or eventId is required" }, 400);
    }

    // If the caller named an event, it must be theirs, and a paid event
    // short-circuits without calling Paystack at all.
    let requestedEvent: { id: string; tier: string; created_by: string; is_paid: boolean; created_at: string } | null = null;
    if (requestedEventId) {
      const { data, error } = await supabaseAdmin
        .from("events")
        .select("id, tier, created_by, is_paid, created_at")
        .eq("id", requestedEventId)
        .maybeSingle();
      if (error || !data || data.created_by !== user.id) return json({ error: "Event not found" }, 404);
      requestedEvent = data;
      if (data.is_paid) return json({ status: "already_paid", tier: data.tier });
    }

    let txn: Txn | null = null;

    if (reference) {
      const { httpStatus, body: result } = await paystackGet(`/transaction/verify/${encodeURIComponent(reference)}`);
      if (httpStatus === 404 || !result.status || !result.data) {
        return json({ error: "Transaction not found at Paystack" }, 404);
      }
      txn = result.data;
      if (txn.reference !== reference) return json({ error: "Reference mismatch" }, 400);
    } else if (requestedEvent) {
      // eventId only: find one of this user's successful charges for the
      // exact tier price since the event was created, that isn't already
      // claimed by another event.
      const tierConfig = TIER_CONFIG[requestedEvent.tier];
      if (!tierConfig) return json({ error: "This event does not need payment" }, 400);

      const { body: list } = await paystackGet(
        `/transaction?status=success&perPage=100&from=${encodeURIComponent(requestedEvent.created_at)}`
      );
      const candidates: Txn[] = (Array.isArray(list.data) ? list.data : []).filter(
        (t: Txn) =>
          t.status === "success" &&
          t.amount === tierConfig.amountCents &&
          sameEmail(t.customer?.email, user.email) &&
          [null, requestedEvent!.id].includes(eventIdFromTransaction(t))
      );

      const { data: claimed } = await supabaseAdmin
        .from("payments")
        .select("payment_reference")
        .in("payment_reference", candidates.map((t) => t.reference));
      const claimedRefs = new Set((claimed ?? []).map((p: { payment_reference: string }) => p.payment_reference));

      // Prefer a charge explicitly tied to this event over an unattributed one.
      const open = candidates.filter((t) => !claimedRefs.has(t.reference));
      txn = open.find((t) => eventIdFromTransaction(t) === requestedEvent!.id) ?? open[0] ?? null;
      if (!txn) return json({ status: "not_found" }, 404);
    }

    if (!txn || txn.status !== "success") {
      return json({ status: txn?.status ?? "unknown", error: "Payment not successful" }, 400);
    }

    // Which event does this charge belong to?
    const boundEventId = eventIdFromTransaction(txn);
    if (requestedEventId && boundEventId && boundEventId !== requestedEventId) {
      return json({ error: "This payment belongs to a different event" }, 403);
    }
    const eventId = requestedEventId || boundEventId;
    if (!eventId) return json({ error: "Could not tell which event this payment is for" }, 400);

    // Charges tied to the event by our metadata/reference are checked
    // against ownership below. A charge with no such tie (paid through some
    // other Paystack page) is only accepted if the payer's email is the
    // caller's own — otherwise anyone who learned a reference could claim it.
    if (!boundEventId && !sameEmail(txn.customer?.email, user.email)) {
      return json({ error: "This payment was made with a different email address" }, 403);
    }

    if (!requestedEvent) {
      const { data } = await supabaseAdmin
        .from("events")
        .select("created_by")
        .eq("id", eventId)
        .maybeSingle();
      if (!data || data.created_by !== user.id) return json({ error: "Event not found" }, 404);
    }

    const result = await applyPaystackPayment(supabaseAdmin, eventId, txn);
    if (!result.ok) return json({ error: result.error }, result.status);

    return json({ status: result.alreadyPaid ? "already_paid" : "paid", tier: result.tier });
  } catch (error) {
    console.error("paystack-verify failed:", error);
    return json({ error: (error as Error).message }, 400);
  }
});
