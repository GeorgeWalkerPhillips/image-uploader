// Sends a welcome email. Called only by the on_email_confirmed trigger
// (welcome-email-trigger-migration.sql) via pg_net, the moment a user's
// email_confirmed_at first gets set — never by the client.
//
// Deploy: supabase functions deploy send-welcome-email --project-ref <ref>
// Secrets required: RESEND_API_KEY, RESEND_FROM_EMAIL (see _shared/resend.ts),
// EMAIL_TRIGGER_SECRET (must match the Vault 'email_trigger_secret' value
// the trigger sends — see welcome-email-trigger-migration.sql). ALLOWED_ORIGIN
// should already be set from PAYMENT_SETUP.md.

import { sendEmail } from "../_shared/resend.ts";
import { wrapEmail, emailHeading, emailButton, emailFootnote } from "../_shared/emailTemplate.ts";

const emailTriggerSecret = Deno.env.get("EMAIL_TRIGGER_SECRET");

Deno.serve(async (req) => {
  if (!emailTriggerSecret || req.headers.get("x-email-trigger-secret") !== emailTriggerSecret) {
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
        ${emailHeading(`Welcome, ${full_name || "there"}`)}
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
