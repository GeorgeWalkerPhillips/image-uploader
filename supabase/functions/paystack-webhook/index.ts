// One of only two things allowed to mark an event as paid (the other is
// paystack-verify, the browser-triggered fallback) — both run as the service
// role through _shared/paystackPayment.ts. enforce_event_billing_integrity()
// (security-hardening.sql / free-tier-event-limit.sql) rejects every other
// attempt at the database level, regardless of what the frontend does or
// doesn't check.
//
// Also receives Wedding Planner purchases (reference wp-<userId>-<rand>,
// metadata.product "wedding_planner"): those are routed to applyPlannerPayment
// (_shared/weddingPlanner.ts) right after signature verification; every other
// charge takes the original event path unchanged.
//
// Deploy: supabase functions deploy paystack-webhook --project-ref <ref>
// Secrets required: PAYSTACK_SECRET_KEY, RESEND_API_KEY, RESEND_FROM_EMAIL
// (see _shared/resend.ts for the latter two — used for the payment receipt
// email below), ALLOWED_ORIGIN (receipt links). SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are auto-injected
// by Supabase for Edge Functions — no need to set them yourself.
// Register in Paystack Dashboard -> Settings -> API Keys & Webhooks:
//   https://<project-ref>.supabase.co/functions/v1/paystack-webhook

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { applyPaystackPayment, eventIdFromTransaction } from "../_shared/paystackPayment.ts";
import { routeTransaction } from "../_shared/weddingPlanner.ts";
import { applyPlannerPaymentServer } from "../_shared/weddingPlannerServer.ts";

const paystackSecretKey = Deno.env.get("PAYSTACK_SECRET_KEY")!;

// The service role bypasses RLS entirely — safe here only because this
// function verifies the request really came from Paystack (signature
// check below) before ever touching the database.
const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// Paystack signs webhooks with HMAC-SHA512 of the raw request body using
// your secret key — there's no separate webhook signing secret like
// Stripe's whsec_.
async function verifyPaystackSignature(rawBody: string, signatureHeader: string) {
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

    // Wedding Planner purchases share this webhook. Only charges carrying a
    // planner signal (wp- reference or metadata.product) are diverted here;
    // everything else falls through to the unchanged event flow below.
    const route = routeTransaction(data);
    if (route.kind !== "event") {
      if (route.kind === "conflict") {
        console.error(`Planner charge ${data?.reference} refused: ${route.reason}`);
        await supabaseAdmin.from("error_logs").insert({
          severity: "error",
          source: "paystack-webhook:planner-conflict",
          message: `charge.success ${data?.reference} refused: ${route.reason}`,
        });
        return new Response("Conflicting product signals", { status: 200 });
      }
      const planned = await applyPlannerPaymentServer(supabaseAdmin, route.userId, data);
      if (!planned.ok) {
        console.error(`Planner payment not applied: ${planned.error}`);
        // Every refusal is recorded (reference + reason + status only; no email
        // or other personal data) so a paid-but-ungranted customer is findable.
        try {
          await supabaseAdmin.from("error_logs").insert({
            severity: "error",
            source: "wedding-planner:webhook",
            message: `charge.success ${data?.reference} not applied (status ${planned.status}): ${planned.error}`.slice(0, 500),
          });
        } catch {
          // diagnostics only; never change the response over a logging failure
        }
        return new Response(planned.error, { status: planned.status === 500 ? 500 : 200 });
      }
      return new Response(JSON.stringify({ received: true }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    }

    // metadata -> reference, in that order (see eventIdFromTransaction).
    // Charges that carry neither (e.g. paid through a Paystack-hosted page)
    // can't be tied to an event here; the customer's return to /admin hits
    // paystack-verify, which can.
    const eventId = eventIdFromTransaction(data);
    if (!eventId) {
      console.error(
        "No event id in transaction metadata or reference:",
        JSON.stringify({ reference: data.reference, metadata: data.metadata })
      );
      await supabaseAdmin.from("error_logs").insert({
        severity: "error",
        source: "paystack-webhook:unresolved",
        message: `charge.success ${data.reference} (${data.amount}) has no event id in metadata/reference`,
      });
      return new Response("Invalid metadata", { status: 400 });
    }

    const result = await applyPaystackPayment(supabaseAdmin, eventId, data);

    if (!result.ok) {
      console.error(`Payment not applied for event ${eventId}: ${result.error}`);
      // 500 = transient, let Paystack retry. Anything else (amount
      // mismatch, tier mismatch, reference reused...) will never succeed
      // on retry, so acknowledge it with 200.
      return new Response(result.error, { status: result.status === 500 ? 500 : 200 });
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
});
