// Thin wrapper around Resend's REST API, shared by every Edge Function that
// sends app email (event-created, payment receipt, archive-ready). Supabase
// only sends auth emails (confirm/reset) itself — anything else needs a
// real transactional email provider called from server-side code.
//
// Secrets required (project-level, shared across all functions — set via
// Supabase Dashboard -> Edge Functions -> Secrets, or `supabase secrets set`):
//   RESEND_API_KEY   - from resend.com/api-keys
//   RESEND_FROM_EMAIL - e.g. "Capture by Val <notifications@yourdomain.com>",
//                        must be on a domain verified in Resend

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const RESEND_FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL")!;

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: RESEND_FROM_EMAIL,
      to,
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend send failed (${response.status}): ${body}`);
  }

  return response.json();
}
