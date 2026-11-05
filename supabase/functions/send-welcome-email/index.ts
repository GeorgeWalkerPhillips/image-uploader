// Sends a welcome email. Called only by the on_email_confirmed trigger
// (welcome-email-trigger-migration.sql) via pg_net, the moment a user's
// email_confirmed_at first gets set — never by the client.
//
// Deploy: supabase functions deploy send-welcome-email --project-ref <ref>
//   (verify_jwt stays ON, the default.)
// Secrets required: RESEND_API_KEY, RESEND_FROM_EMAIL (see _shared/resend.ts).
// ALLOWED_ORIGIN should already be set from PAYMENT_SETUP.md.
//
// Auth (changed 2026-11): the trigger sends the project's service role key from
// Vault ('service_role_key', the same one the cron jobs use) as the bearer
// token, and this function requires it to equal SUPABASE_SERVICE_ROLE_KEY
// (constant-time compare). The old shared EMAIL_TRIGGER_SECRET is no longer
// used, so there is no extra secret to keep in sync.

import { sendEmail } from "../_shared/resend.ts";
import { wrapEmail, emailHeading, emailButton, emailFootnote } from "../_shared/emailTemplate.ts";

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

Deno.serve(async (req) => {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const provided = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!serviceKey || !safeEqual(provided, serviceKey)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { email, full_name } = await req.json();
  if (!email) {
    return new Response("Missing email", { status: 400 });
  }

  // No browser Origin header on a server-to-server trigger call, so fall
  // back to the first configured domain — same value CORS uses.
  const siteOrigin = (Deno.env.get("ALLOWED_ORIGIN") || "https://valere.co.za")
    .split(",")[0]
    .trim();

  try {
    await sendEmail({
      to: email,
      subject: "Welcome!",
      html: wrapEmail(`
        ${emailHeading(`Welcome, ${escapeHtml(String(full_name || "there"))}`)}
        <p>Your email's confirmed and your account is ready. Create an event, share the link with your guests, and every photo they capture lands straight in your gallery.</p>
        ${emailButton(`${siteOrigin}/admin`, "Create your first event")}
        ${emailFootnote("You're receiving this because you just signed up.")}
      `),
    });
  } catch (err) {
    console.error("Failed to send welcome email:", err);
    return new Response("Failed to send email", { status: 502 });
  }

  return new Response(JSON.stringify({ sent: true }), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
});
