// Self-healing reconciler for paid-but-locked events. Every 5 minutes it asks
// Postgres to re-unlock any event that has a recorded, succeeded payment which
// matches the event's tier price, ZAR and owner (rpc reconcile_paid_events), then
// looks at what is still wrong (rpc reconcile_paid_events_preview) and emails ONE
// plain alert to the ops address if anything was fixed or needs a human. At most
// one alert per event per 24h (tracked in error_logs, source
// 'reconcile-paid-events-alert').
//
// Deploy: supabase functions deploy reconcile-paid-events --project-ref <ref>
//   (verify_jwt stays ON, the default: do NOT pass --no-verify-jwt.)
// Secrets required:
//   OPS_ALERT_EMAIL  the address that receives alerts. Owner must set it:
//                    supabase secrets set OPS_ALERT_EMAIL=<address> --project-ref <ref>
//                    If unset the function still reconciles and logs, and skips the email
//                    (the JSON summary says so). No address is hardcoded anywhere.
//   RESEND_API_KEY, RESEND_FROM_EMAIL (see _shared/resend.ts).
//   SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are auto-injected.
//
// Invoked ONLY by the pg_cron job in reconcile-paid-events-2026-11.sql. Besides
// the platform's JWT check, the bearer token must equal the service role key
// exactly (constant-time compare); anything else gets 401. Browsers never call
// this, so no CORS headers are returned.
//
// Privacy: alerts and logs carry only event ids, tier, payment reference, amount
// and a reason, never customer emails or event names. A failed RPC/lookup/send
// returns 500 so the cron run shows red. Pure logic: _shared/reconcilePaidEvents.ts.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail } from "../_shared/resend.ts";
import { wrapEmail } from "../_shared/emailTemplate.ts";
import {
  ALERT_SOURCE,
  RUN_SOURCE,
  isAuthorized,
  redactEmails,
  runReconcile,
  type ReconcileStore,
} from "../_shared/reconcilePaidEvents.ts";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const store: ReconcileStore = {
  async reconcile() {
    const { data, error } = await supabaseAdmin.rpc("reconcile_paid_events");
    if (error) throw new Error(error.message);
    return data ?? [];
  },

  async preview() {
    const { data, error } = await supabaseAdmin.rpc("reconcile_paid_events_preview");
    if (error) throw new Error(error.message);
    return data ?? [];
  },

  async recentlyAlerted(eventIds, sinceIso) {
    const { data, error } = await supabaseAdmin
      .from("error_logs")
      .select("event_id")
      .eq("source", ALERT_SOURCE)
      .gte("created_at", sinceIso)
      .in("event_id", eventIds);
    if (error) throw new Error(error.message);
    return new Set((data ?? []).map((r: { event_id: string }) => r.event_id));
  },

  async logAlert(item) {
    const { error } = await supabaseAdmin.from("error_logs").insert({
      event_id: item.eventId,
      severity: item.kind === "fixed" ? "warning" : "error",
      source: ALERT_SOURCE,
      message: `${item.kind}: payment ${item.paymentReference} (${item.tier}): ${item.reason}`.slice(0, 1000),
      context: { kind: item.kind, tier: item.tier, payment_reference: item.paymentReference, amount_cents: item.amountCents },
    });
    if (error) throw new Error(error.message);
  },

  async logFailure(message) {
    console.error(`reconcile-paid-events ${message}`);
    try {
      await supabaseAdmin.from("error_logs").insert({ severity: "error", source: RUN_SOURCE, message });
    } catch {
      // nothing more we can do
    }
  },

  sendEmail,
  wrapHtml: wrapEmail,
};

Deno.serve(async (req) => {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!isAuthorized(req.headers.get("Authorization"), serviceKey)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const result = await runReconcile(store, {
    opsEmail: Deno.env.get("OPS_ALERT_EMAIL"),
    now: new Date(),
  });
  if (result.status !== 200) console.error(redactEmails(JSON.stringify(result.body)));

  return new Response(JSON.stringify(result.body), {
    headers: { "Content-Type": "application/json" },
    status: result.status,
  });
});
