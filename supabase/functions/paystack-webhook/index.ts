// The only thing allowed to mark an event as paid — enforce_event_billing_
// integrity() (security-hardening.sql / free-tier-event-limit.sql) rejects
// every other attempt at the database level, regardless of what the
// frontend does or doesn't check.
//
// Deploy: supabase functions deploy paystack-webhook --project-ref <ref>
// Secrets required: PAYSTACK_SECRET_KEY, RESEND_API_KEY, RESEND_FROM_EMAIL
// (see _shared/resend.ts for the latter two — used for the payment receipt
// email below). SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are auto-injected
// by Supabase for Edge Functions — no need to set them yourself.
// Register in Paystack Dashboard -> Settings -> API Keys & Webhooks:
//   https://<project-ref>.supabase.co/functions/v1/paystack-webhook

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail } from "../_shared/resend.ts";
import { wrapEmail, emailHeading, emailButton, emailFootnote, qrCodeImage } from "../_shared/emailTemplate.ts";

const paystackSecretKey = Deno.env.get("PAYSTACK_SECRET_KEY")!;

// The service role bypasses RLS entirely — safe here only because this
// function verifies the request really came from Paystack (signature
// check below) before ever touching the database.
const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// Mirror of src/services/pricingTiers.js and the enforce_event_billing_
// integrity() trigger — keep all three in sync.
const TIER_CONFIG: Record<string, { guestCap: number | null; photoCap: number | null }> = {
  starter: { guestCap: 25, photoCap: 25 },
  growth: { guestCap: 100, photoCap: 40 },
  unlimited: { guestCap: null, photoCap: null },
};

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
      // and fine to ignore.
      console.error("Failed to record payment:", paymentError);
    }

    // Only send the receipt on the first delivery of this webhook — 23505
    // above means we've already processed (and emailed) this exact
    // payment, and Paystack retries deliveries.
    if (!paymentError) {
      try {
        const { data: eventRow } = await supabaseAdmin
          .from("events")
          .select("id, name, start_date, end_date")
          .eq("id", eventId)
          .single();

        const { data: profile } = await supabaseAdmin
          .from("user_profiles")
          .select("email, full_name")
          .eq("id", userId)
          .single();

        if (profile?.email && eventRow) {
          // No browser Origin header on a server-to-server webhook call, so
          // fall back to the first configured domain (same value CORS uses).
          const siteOrigin = (Deno.env.get("ALLOWED_ORIGIN") || "https://valere.co.za")
            .split(",")[0]
            .trim();
          const joinUrl = `${siteOrigin}/camera?event=${eventRow.id}`;

          await sendEmail({
            to: profile.email,
            subject: `Payment confirmed for "${eventRow.name}"`,
            html: wrapEmail(`
              ${emailHeading("Payment received")}
              <p>Hi ${profile.full_name || ""},</p>
              <p>Your payment for <strong>${eventRow.name}</strong> (${tier} plan) was successful, and your event is now live.</p>
              <p><strong>Amount:</strong> ${((data.amount || 0) / 100).toFixed(2)} ${(data.currency || "ZAR").toUpperCase()}<br/>
              <strong>Reference:</strong> ${data.reference}<br/>
              <strong>Dates:</strong> ${new Date(eventRow.start_date).toLocaleDateString()} &ndash; ${new Date(eventRow.end_date).toLocaleDateString()}</p>
              <p style="margin-top:28px;">Scan or share this to let guests join:</p>
              ${qrCodeImage(joinUrl)}
              <p style="text-align:center;word-break:break-all;font-size:13px;color:#666666;">${joinUrl}</p>
              ${emailButton(`${siteOrigin}/admin`, "Open event dashboard")}
              ${emailFootnote(
                "Photos stay available for 30 days after your event ends. 30 days after that, we'll email you a zip download link and then remove the originals to free up storage."
              )}
            `),
          });
        }
      } catch (emailError) {
        // Never fail the webhook response over an email hiccup — the event
        // is already correctly marked paid at this point either way, and a
        // failed webhook response would make Paystack retry unnecessarily.
        // Written to error_logs (not just console.error) since Edge
        // Function runtime logs aren't otherwise visible without the
        // dashboard — matches how every other failure in this app surfaces.
        console.error("Failed to send payment confirmation email:", emailError);
        await supabaseAdmin.from("error_logs").insert({
          event_id: eventId,
          severity: "error",
          source: "paystack-webhook:sendEmail",
          message: String((emailError as Error).message || emailError).slice(0, 2000),
        });
      }
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
});
