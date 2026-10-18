// Daily Wedding HQ email reminders: one digest email per wedding member per
// run, listing events, open tasks and unpaid invoice balances that are coming
// up (today / tomorrow / in N days, per the member's wedding_reminder_settings,
// defaults {0,1}). Items already sent are tracked in wedding_reminder_log so
// nothing is reminded twice. "Today" is the Africa/Johannesburg date.
//
// Deploy: supabase functions deploy send-wedding-reminders --project-ref <ref>
// Secrets required: RESEND_API_KEY, RESEND_FROM_EMAIL (see _shared/resend.ts),
// ALLOWED_ORIGIN (first value is used for the email button; fallback
// https://valere.co.za). SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are
// auto-injected. No new secrets.
//
// Invoked ONLY by the daily pg_cron job in wedding-hq-2026-10d-reminders.sql
// (05:00 UTC = 07:00 Johannesburg). Same authorization as purge-expired-events:
// the bearer token must equal the service role key exactly; anything else gets
// 401. Browsers never call this function, so no CORS headers are returned.
//
// Privacy: emails contain only titles, JHB times and payment amounts — never
// guest details, document info, notes or bank details — and email addresses
// are never logged. Pure logic lives in _shared/weddingReminders.ts.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail } from "../_shared/resend.ts";
import { wrapEmail, emailHeading, emailButton, emailFootnote } from "../_shared/emailTemplate.ts";
import {
  escapeHtml,
  digestSectionsHtml,
  jhbDayStartUtc,
  addDays,
  redactEmails,
  runReminders,
  safeEqual,
  type ReminderStore,
  type ReminderItem,
} from "../_shared/weddingReminders.ts";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const siteOrigin = (Deno.env.get("ALLOWED_ORIGIN") || "https://valere.co.za").split(",")[0].trim();

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

const store: ReminderStore = {
  async listWeddingIds() {
    const { data, error } = await supabaseAdmin.from("wedding_weddings").select("id");
    fail(error);
    return (data ?? []).map((w: { id: string }) => w.id);
  },

  async listMembers(weddingId) {
    const { data, error } = await supabaseAdmin
      .from("wedding_members").select("user_id, role").eq("wedding_id", weddingId);
    fail(error);
    return data ?? [];
  },

  async listSettings(weddingId) {
    const { data, error } = await supabaseAdmin
      .from("wedding_reminder_settings")
      .select("user_id, enabled, lead_days, include_events, include_tasks, include_payments")
      .eq("wedding_id", weddingId);
    fail(error);
    return data ?? [];
  },

  async loadItems(weddingId, fromDate, toDate) {
    const [events, tasks, invoices] = await Promise.all([
      supabaseAdmin.from("wedding_events").select("id, title, starts_at, all_day")
        .eq("wedding_id", weddingId)
        .gte("starts_at", jhbDayStartUtc(fromDate))
        .lt("starts_at", jhbDayStartUtc(addDays(toDate, 1))),
      supabaseAdmin.from("wedding_tasks").select("id, title, due_on, status, assignee")
        .eq("wedding_id", weddingId)
        .neq("status", "done")
        .gte("due_on", fromDate)
        .lte("due_on", toDate),
      supabaseAdmin.from("wedding_invoices").select("id, vendor_name, total_cents, due_on")
        .eq("wedding_id", weddingId)
        .gte("due_on", fromDate)
        .lte("due_on", toDate),
    ]);
    fail(events.error);
    fail(tasks.error);
    fail(invoices.error);

    const invoiceRows = invoices.data ?? [];
    let paymentRows: { invoice_id: string; amount_cents: number }[] = [];
    if (invoiceRows.length > 0) {
      const payments = await supabaseAdmin.from("wedding_payments").select("invoice_id, amount_cents")
        .eq("wedding_id", weddingId)
        .in("invoice_id", invoiceRows.map((i: { id: string }) => i.id));
      fail(payments.error);
      paymentRows = payments.data ?? [];
    }
    return { events: events.data ?? [], tasks: tasks.data ?? [], invoices: invoiceRows, payments: paymentRows };
  },

  async loadLog(weddingId, userId, fromDate, toDate) {
    const { data, error } = await supabaseAdmin.from("wedding_reminder_log")
      .select("item_kind, item_id, due_on, lead_days")
      .eq("wedding_id", weddingId).eq("user_id", userId)
      .gte("due_on", fromDate).lte("due_on", toDate);
    fail(error);
    return data ?? [];
  },

  async insertLog(weddingId, userId, keys) {
    const { error } = await supabaseAdmin.from("wedding_reminder_log").upsert(
      keys.map((k) => ({ wedding_id: weddingId, user_id: userId, ...k })),
      { onConflict: "wedding_id,user_id,item_kind,item_id,due_on,lead_days", ignoreDuplicates: true }
    );
    fail(error);
  },

  async getEmail(userId) {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (error || !data?.user) return null;
    if (data.user.is_anonymous || !data.user.email) return null;
    return data.user.email;
  },

  sendEmail,

  buildHtml(items: readonly ReminderItem[]) {
    return wrapEmail(`
      ${emailHeading("Coming up")}
      ${digestSectionsHtml(items)}
      ${emailButton(`${escapeHtml(siteOrigin)}/hq/calendar`, "Open Wedding HQ")}
      ${emailFootnote("You can change or turn off these reminders in Wedding HQ settings.")}
    `);
  },
};

Deno.serve(async (req) => {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const provided = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!serviceKey || !safeEqual(provided, serviceKey)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const summary = await runReminders(store, new Date(), (scope, err) => {
    // Reason only: no emails, no payloads. Redact in case a provider echoes the address.
    const message = redactEmails(String((err as Error)?.message ?? err)).slice(0, 500);
    console.error(`send-wedding-reminders ${scope} failed: ${message}`);
    supabaseAdmin.from("error_logs")
      .insert({ severity: "error", source: `send-wedding-reminders:${scope}`, message })
      .then(() => {}, () => {});
  });

  return new Response(JSON.stringify(summary), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
});
