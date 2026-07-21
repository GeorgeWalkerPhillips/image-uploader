// Daily archival job: for every event whose expiry_date was more than 30
// days ago and hasn't been purged yet, zip its photos into the private
// event-archives bucket, email the organizer a signed download link, then
// delete the photos (storage objects + DB rows) to free up storage. The
// event row itself is kept (name, dates, payment history) — only its
// photos are removed.
//
// Deploy: supabase functions deploy purge-expired-events --project-ref <ref>
// Secrets required: RESEND_API_KEY, RESEND_FROM_EMAIL (see
// _shared/resend.ts). SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are
// auto-injected by Supabase for Edge Functions.
//
// Invoked by a daily pg_cron job (see event-archive-and-emails.sql), never
// directly by the app — the request is authorized by comparing the bearer
// token to the actual service role key (see below), not just by having any
// valid Supabase JWT, since the default JWT check alone would let any
// signed-in user trigger mass deletion of other people's photos.
//
// Known limitation: this processes all due events, and zips each one, in a
// single invocation — Edge Functions have finite memory/wall-time budgets,
// so an event with a very large number of (or very large) photos, or many
// events becoming due on the same day, could hit those limits. If that
// becomes a problem in practice, split this into one invocation per event
// (e.g. cron calls a "list due events" function that enqueues one job per
// event) rather than looping over all of them here.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import JSZip from "https://esm.sh/jszip@3.10.1";
import { sendEmail } from "../_shared/resend.ts";
import { wrapEmail, emailHeading, emailButton, emailFootnote } from "../_shared/emailTemplate.ts";

const PHOTOS_BUCKET = "event-photos";
const ARCHIVES_BUCKET = "event-archives";
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const PURGE_AFTER_DAYS = 30;

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

function sanitizeForPath(name: string) {
  return (name || "event").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
}

async function archiveAndPurgeEvent(event: { id: string; name: string; created_by: string }) {
  const { data: photos, error: photosError } = await supabaseAdmin
    .from("photos")
    .select("id, storage_path, file_name")
    .eq("event_id", event.id);

  if (photosError) throw photosError;

  if (!photos || photos.length === 0) {
    await supabaseAdmin
      .from("events")
      .update({ photos_purged_at: new Date().toISOString() })
      .eq("id", event.id);
    return { eventId: event.id, status: "no_photos" };
  }

  const { data: profile } = await supabaseAdmin
    .from("user_profiles")
    .select("email, full_name")
    .eq("id", event.created_by)
    .single();

  if (!profile?.email) {
    throw new Error(`No profile email for organizer ${event.created_by}`);
  }

  const zip = new JSZip();
  const folder = zip.folder(sanitizeForPath(event.name));

  for (const photo of photos) {
    const { data: fileBlob, error: downloadError } = await supabaseAdmin.storage
      .from(PHOTOS_BUCKET)
      .download(photo.storage_path);

    if (downloadError || !fileBlob) {
      console.error(`Skipping unreadable photo ${photo.storage_path}:`, downloadError);
      continue;
    }

    folder!.file(photo.file_name || `${photo.id}.jpg`, await fileBlob.arrayBuffer());
  }

  const zipBytes = await zip.generateAsync({ type: "uint8array" });
  const archivePath = `${event.id}/${sanitizeForPath(event.name)}-archive.zip`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from(ARCHIVES_BUCKET)
    .upload(archivePath, zipBytes, { contentType: "application/zip", upsert: true });

  if (uploadError) throw uploadError;

  const { data: signedUrlData, error: signError } = await supabaseAdmin.storage
    .from(ARCHIVES_BUCKET)
    .createSignedUrl(archivePath, SIGNED_URL_TTL_SECONDS);

  if (signError || !signedUrlData?.signedUrl) {
    throw signError || new Error("Failed to create signed URL");
  }

  // Photos are only deleted after the email actually sends — if Resend is
  // down or the send fails, better to retry the whole thing tomorrow than
  // delete photos with no notice ever reaching the organizer.
  await sendEmail({
    to: profile.email,
    subject: `Your photos from "${event.name}" are ready to download`,
    html: wrapEmail(`
      ${emailHeading(`${event.name} &mdash; archive ready`)}
      <p>Hi ${profile.full_name || ""},</p>
      <p>Your event ended a while ago, so we've packaged all ${photos.length} photo${photos.length === 1 ? "" : "s"} into a zip file.</p>
      ${emailButton(signedUrlData.signedUrl, "Download your photos")}
      <p style="font-size:13px;color:#666666;">This link expires in 7 days.</p>
      ${emailFootnote(
        "To free up storage, the original photos have now been removed from Valere. This zip is the only remaining copy — please save it somewhere safe."
      )}
    `),
  });

  const storagePaths = photos.map((p) => p.storage_path);
  const { error: removeError } = await supabaseAdmin.storage.from(PHOTOS_BUCKET).remove(storagePaths);
  if (removeError) {
    // Log but don't throw: the photos DB rows (deleted next) are the
    // app's source of truth for what's "still there", and are removed
    // regardless of whether every storage object above was cleaned up.
    console.error(`Failed to remove some storage objects for event ${event.id}:`, removeError);
  }

  const { error: deleteError } = await supabaseAdmin.from("photos").delete().eq("event_id", event.id);
  if (deleteError) throw deleteError;

  await supabaseAdmin
    .from("events")
    .update({ photos_purged_at: new Date().toISOString() })
    .eq("id", event.id);

  return { eventId: event.id, status: "archived", photoCount: photos.length };
}

Deno.serve(async (req) => {
  const authHeader = req.headers.get("Authorization") ?? "";
  const providedToken = authHeader.replace(/^Bearer\s+/i, "");

  // Exact match against the real service role key, not just "any valid
  // JWT" — the default Edge Function JWT check would otherwise let any
  // signed-in user trigger this and delete other organizers' photos.
  if (providedToken !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
    return new Response("Forbidden", { status: 403 });
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - PURGE_AFTER_DAYS);

  const { data: events, error: eventsError } = await supabaseAdmin
    .from("events")
    .select("id, name, created_by")
    .lt("expiry_date", cutoff.toISOString())
    .is("photos_purged_at", null);

  if (eventsError) {
    console.error("Failed to query expired events:", eventsError);
    return new Response(JSON.stringify({ error: eventsError.message }), { status: 500 });
  }

  const results = [];

  for (const event of events || []) {
    try {
      results.push(await archiveAndPurgeEvent(event));
    } catch (error) {
      console.error(`Failed to archive/purge event ${event.id}:`, error);
      await supabaseAdmin.from("error_logs").insert({
        event_id: event.id,
        severity: "critical",
        source: "purge-expired-events",
        message: String((error as Error).message || error).slice(0, 2000),
      });
      results.push({ eventId: event.id, status: "failed" });
    }
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
});
