// Sends a "your event is live" confirmation email. Called from the client
// (src/services/emailService.js) right after a free-tier event is created —
// paid-tier events get an equivalent email from paystack-webhook once
// payment is confirmed instead, so this isn't called for those (avoids a
// duplicate email that would arrive before payment is even done).
//
// Deploy: supabase functions deploy send-event-created-email --project-ref <ref>
// Secrets required: RESEND_API_KEY, RESEND_FROM_EMAIL (see _shared/resend.ts).
// SUPABASE_URL and SUPABASE_ANON_KEY are auto-injected by Supabase for Edge
// Functions — no need to set them yourself.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail } from "../_shared/resend.ts";
import { corsHeadersFor } from "../_shared/cors.ts";
import { wrapEmail, emailHeading, emailButton, emailFootnote, qrCodeImage } from "../_shared/emailTemplate.ts";

Deno.serve(async (req) => {
  const corsHeaders = corsHeadersFor(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Runs as the calling user (not service role) — forwarding their JWT
    // means auth.uid() and RLS apply normally, so the ownership check below
    // is real enforcement, not just a courtesy check.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } }
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user || !user.email) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { eventId } = await req.json();

    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id, name, start_date, end_date, created_by")
      .eq("id", eventId)
      .single();

    // RLS already scopes this select, but an explicit ownership check keeps
    // this endpoint from ever emailing anyone about an event that isn't
    // theirs, regardless of what RLS policy exists today or later.
    if (eventError || !event || event.created_by !== user.id) {
      return new Response(JSON.stringify({ error: "Event not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Reflects whichever domain the organizer is actually using (apex vs.
    // www, custom domain vs. vercel.app) rather than a single hardcoded
    // value — same reasoning as corsHeadersFor.
    const dashboardOrigin = req.headers.get("origin") || "https://valere.co.za";
    // Matches the QR value AdminEventManager.js renders in the dashboard
    // (QRCodeCanvas value prop) — same URL, so scanning either one behaves
    // identically for a guest.
    const joinUrl = `${dashboardOrigin}/camera?event=${event.id}`;

    await sendEmail({
      to: user.email,
      subject: `Your event "${event.name}" is live`,
      html: wrapEmail(`
        ${emailHeading(`${event.name} is ready for guests`)}
        <p>Your event is live and guests can start uploading photos right away — no app or account needed on their end.</p>
        <p><strong>Dates:</strong> ${new Date(event.start_date).toLocaleDateString()} &ndash; ${new Date(event.end_date).toLocaleDateString()}</p>
        <p style="margin-top:28px;">Scan or share this to let guests join:</p>
        ${qrCodeImage(joinUrl)}
        <p style="text-align:center;word-break:break-all;font-size:13px;color:#666666;">${joinUrl}</p>
        ${emailButton(`${dashboardOrigin}/admin`, "Open event dashboard")}
        ${emailFootnote(
          "Photos stay available for 30 days after your event ends. 30 days after that, we'll email you a zip download link and then remove the originals to free up storage."
        )}
      `),
    });

    return new Response(JSON.stringify({ sent: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("send-event-created-email error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
