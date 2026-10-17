// Single source of truth for turning a successful Paystack charge into a
// paid event. Used by BOTH paystack-webhook (Paystack -> us) and
// paystack-verify (browser -> us, fallback when the webhook is missed or
// can't resolve the event) so the two paths can never drift apart.
//
// All pricing lives here too: paystack-initialize imports TIER_CONFIG, so
// there is one server-side copy of the amounts/caps. Keep it in sync with
// src/services/pricingTiers.js and enforce_event_billing_integrity() (see
// pricing-rework-2026-09.sql). amountCents is in the smallest ZAR unit
// (cents). "unlimited" is "The Whole Reel" in the UI — key stays
// `unlimited`; it's capped at 500/50 to bound storage cost.

import { sendEmail } from "./resend.ts";
import { wrapEmail, emailHeading, emailButton, emailFootnote, qrCodeImage } from "./emailTemplate.ts";

export const TIER_CONFIG: Record<
  string,
  { guestCap: number | null; photoCap: number | null; amountCents: number }
> = {
  starter: { guestCap: 25, photoCap: 15, amountCents: 17900 }, // R179
  growth: { guestCap: 50, photoCap: 25, amountCents: 39900 }, // R399
  unlimited: { guestCap: 500, photoCap: 50, amountCents: 99900 }, // R999
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Paystack references may only contain alphanumerics, "-", "." and "=" (no
// underscores), so the event id is embedded as "cbv-<eventId>-<random>".
export function buildReference(eventId: string): string {
  const rand = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  return `cbv-${eventId}-${rand}`;
}

export function eventIdFromReference(reference: unknown): string | null {
  if (typeof reference !== "string") return null;
  const match = reference.match(/^cbv-([0-9a-f-]{36})-[a-z0-9]+$/i);
  return match && UUID_RE.test(match[1]) ? match[1] : null;
}

// Paystack normally returns metadata as an object, but has been seen as a
// JSON string (and Paystack's own checkout adds `referrer`, sometimes as
// the only key). Always normalise to a plain object.
export function parseMetadata(raw: unknown): Record<string, unknown> {
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

// The event a transaction claims to be for, from the metadata we set in
// paystack-initialize, else from our own reference format. Null for
// transactions that carry neither (e.g. paid through a Paystack-hosted page).
export function eventIdFromTransaction(txn: { metadata?: unknown; reference?: unknown }): string | null {
  const fromMetadata = parseMetadata(txn.metadata).eventId;
  if (typeof fromMetadata === "string" && UUID_RE.test(fromMetadata)) return fromMetadata;
  return eventIdFromReference(txn.reference);
}

export type ApplyResult =
  | { ok: true; alreadyPaid: boolean; tier: string }
  | { ok: false; status: number; error: string };

// deno-lint-ignore no-explicit-any
type Txn = any;
// deno-lint-ignore no-explicit-any
type AdminClient = any;

// Validates an already-authenticated Paystack transaction (webhook body
// signature checked, or fetched via GET /transaction/verify) against the
// event row and marks the event paid. Idempotent: safe to call repeatedly
// and concurrently for the same transaction (the payment_reference UNIQUE
// constraint claims the transaction for exactly one event, and only the
// call that flips is_paid false -> true sends the receipt).
//
// The event's own tier/owner come from the database, never from metadata,
// so a missing or tampered metadata block can't change what gets unlocked.
export async function applyPaystackPayment(
  supabaseAdmin: AdminClient,
  eventId: string,
  txn: Txn
): Promise<ApplyResult> {
  const { data: event, error: eventError } = await supabaseAdmin
    .from("events")
    .select("id, name, tier, created_by, is_paid, start_date, end_date")
    .eq("id", eventId)
    .maybeSingle();

  if (eventError || !event) {
    return { ok: false, status: 404, error: "Event not found" };
  }

  const tierConfig = TIER_CONFIG[event.tier];
  if (!tierConfig) {
    return { ok: false, status: 400, error: `Event tier "${event.tier}" is not payable` };
  }

  const metadata = parseMetadata(txn.metadata);
  if (typeof metadata.tier === "string" && metadata.tier !== event.tier) {
    return { ok: false, status: 400, error: "Transaction tier does not match event tier" };
  }

  if (txn.status !== undefined && txn.status !== "success") {
    return { ok: false, status: 400, error: `Transaction status is ${txn.status}` };
  }

  const currency = String(txn.currency || "ZAR").toUpperCase();
  if (currency !== "ZAR") {
    return { ok: false, status: 400, error: `Unexpected currency ${currency}` };
  }

  // The charged amount must match this tier's price exactly. A mismatch
  // means a stale checkout from before a price change, or a tampered
  // transaction — don't unlock.
  if (txn.amount !== tierConfig.amountCents) {
    return {
      ok: false,
      status: 400,
      error: `Amount mismatch for event ${eventId} (${event.tier}): charged ${txn.amount}, expected ${tierConfig.amountCents}`,
    };
  }

  // Claim the payment reference for this event first. If it's already
  // recorded for a *different* event, refuse: one charge unlocks one event.
  const { error: paymentError } = await supabaseAdmin.from("payments").insert({
    event_id: eventId,
    user_id: event.created_by,
    payment_reference: txn.reference,
    amount_cents: txn.amount,
    currency,
    status: "succeeded",
    metadata: { tier: event.tier },
  });

  if (paymentError) {
    if (paymentError.code !== "23505") {
      console.error("Failed to record payment:", paymentError);
      return { ok: false, status: 500, error: "Failed to record payment" };
    }
    const { data: existing } = await supabaseAdmin
      .from("payments")
      .select("event_id")
      .eq("payment_reference", txn.reference)
      .maybeSingle();
    if (existing && existing.event_id !== eventId) {
      return { ok: false, status: 409, error: "This payment was already applied to another event" };
    }
  }

  // Only flips unpaid -> paid; returns the row only if this call did it.
  const { data: flipped, error: updateError } = await supabaseAdmin
    .from("events")
    .update({
      is_paid: true,
      payment_status: "completed",
      paid_at: new Date().toISOString(),
      guest_cap: tierConfig.guestCap,
      photo_cap_per_guest: tierConfig.photoCap,
    })
    .eq("id", eventId)
    .eq("is_paid", false)
    .select("id");

  if (updateError) {
    console.error("Failed to mark event paid:", updateError);
    return { ok: false, status: 500, error: "Database update failed" };
  }

  const didFlip = Array.isArray(flipped) && flipped.length > 0;
  if (didFlip) {
    await sendReceipt(supabaseAdmin, event, txn, currency);
  }

  return { ok: true, alreadyPaid: !didFlip, tier: event.tier };
}

async function sendReceipt(
  supabaseAdmin: AdminClient,
  // deno-lint-ignore no-explicit-any
  event: any,
  txn: Txn,
  currency: string
) {
  try {
    const { data: profile } = await supabaseAdmin
      .from("user_profiles")
      .select("email, full_name")
      .eq("id", event.created_by)
      .single();

    if (!profile?.email) return;

    // No browser Origin header on a server-to-server call, so use the first
    // configured domain (same value CORS uses).
    const siteOrigin = (Deno.env.get("ALLOWED_ORIGIN") || "https://valere.co.za")
      .split(",")[0]
      .trim();
    const joinUrl = `${siteOrigin}/camera?event=${event.id}`;

    await sendEmail({
      to: profile.email,
      subject: `Payment confirmed for "${event.name}"`,
      html: wrapEmail(`
        ${emailHeading("Payment received")}
        <p>Hi ${profile.full_name || ""},</p>
        <p>Your payment for <strong>${event.name}</strong> (${event.tier} plan) was successful, and your event is now live.</p>
        <p><strong>Amount:</strong> ${((txn.amount || 0) / 100).toFixed(2)} ${currency}<br/>
        <strong>Reference:</strong> ${txn.reference}<br/>
        <strong>Dates:</strong> ${new Date(event.start_date).toLocaleDateString()} &ndash; ${new Date(event.end_date).toLocaleDateString()}</p>
        <p style="margin-top:28px;">Scan or share this to let guests join:</p>
        ${qrCodeImage(joinUrl)}
        <p style="text-align:center;word-break:break-all;font-size:13px;color:#666666;">${joinUrl}</p>
        ${emailButton(`${siteOrigin}/admin`, "Open event dashboard")}
        ${emailFootnote(
          "Photos stay available for 30 days after your event ends. 30 days after that, we'll email you a zip download link and remove the originals to free up storage. That zip is then kept for a further 90 days before it's permanently deleted, so be sure to save it somewhere safe once you get it."
        )}
      `),
    });
  } catch (emailError) {
    // Never fail the payment over an email hiccup — the event is already
    // correctly marked paid. Written to error_logs since Edge Function
    // runtime logs aren't otherwise visible without the dashboard.
    console.error("Failed to send payment confirmation email:", emailError);
    await supabaseAdmin.from("error_logs").insert({
      event_id: event.id,
      severity: "error",
      source: "paystack:sendReceipt",
      message: String((emailError as Error).message || emailError).slice(0, 2000),
    });
  }
}
