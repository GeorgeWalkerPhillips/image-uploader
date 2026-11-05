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
// Max source-photo bytes per archive zip part (see archiveAndPurgeEvent).
const ARCHIVE_PART_BYTES = 40 * 1024 * 1024;
// Memory from one event's photos is not released fast enough to start another
// in the same invocation (WORKER_RESOURCE_LIMIT with 3 big events), so each run
// handles one event, oldest first. The cron job runs hourly to work through a
// backlog (purge-hourly-2026-11.sql); with nothing due a run is a cheap no-op.
const MAX_EVENTS_PER_RUN = 1;
const ORPHAN_MIN_AGE_DAYS = 7;
// Archives used to be kept forever (only the signed URL above expired) —
// every event ever sold added a permanent slice to the monthly storage
// bill against a one-time fee. This bounds it: 90 days after the archive
// is created, delete it too.
const ARCHIVE_PURGE_AFTER_DAYS = 90;
// Only applies to archives created from this change shipping onward —
// without this cutoff, every already-archived event older than 90 days
// would be mass-deleted the first time this runs.
const ARCHIVE_PURGE_CUTOFF = "2026-07-26T00:00:00Z";

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
    .select("id, storage_path, file_name, thumb_path")
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

  // The Edge Function has a small memory budget (~256 MB), and a single zip
  // holds every photo plus the generated zip in memory at once, so big events
  // ("Array buffer allocation failed", every night since October) could never
  // be archived. Instead the photos are packed into parts of at most
  // ARCHIVE_PART_BYTES, one at a time, and each part is uploaded and released
  // before the next is built. JPEGs do not compress, so STORE keeps it cheap.
  const baseName = sanitizeForPath(event.name);
  const parts: { path: string; photoCount: number }[] = [];
  let zip = new JSZip();
  let folder = zip.folder(baseName);
  let bytesInPart = 0;
  let photosInPart = 0;

  const flushPart = async () => {
    if (photosInPart === 0) return;
    const zipBytes = await zip.generateAsync({ type: "uint8array", compression: "STORE" });
    const partNumber = parts.length + 1;
    const path = `${event.id}/${baseName}-archive-part${partNumber}.zip`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from(ARCHIVES_BUCKET)
      .upload(path, zipBytes, { contentType: "application/zip", upsert: true });
    if (uploadError) throw uploadError;
    parts.push({ path, photoCount: photosInPart });
    zip = new JSZip();
    folder = zip.folder(baseName);
    bytesInPart = 0;
    photosInPart = 0;
  };

  for (const photo of photos) {
    const { data: fileBlob, error: downloadError } = await supabaseAdmin.storage
      .from(PHOTOS_BUCKET)
      .download(photo.storage_path);

    // An unreadable photo must stop the whole run: the originals are deleted
    // below, so silently skipping one here would lose it. The event is retried
    // on the next run and logged to error_logs by the caller.
    if (downloadError || !fileBlob) {
      throw new Error(`Cannot read photo ${photo.storage_path}: ${downloadError?.message ?? "no data"}`);
    }

    if (photosInPart > 0 && bytesInPart + fileBlob.size > ARCHIVE_PART_BYTES) await flushPart();

    folder!.file(photo.file_name || `${photo.id}.jpg`, await fileBlob.arrayBuffer());
    bytesInPart += fileBlob.size;
    photosInPart += 1;
  }
  await flushPart();

  // Every part must be present in the archive bucket before anything is
  // deleted or the organizer is told it is safe.
  const { data: stored, error: listError } = await supabaseAdmin.storage
    .from(ARCHIVES_BUCKET)
    .list(event.id, { limit: 1000 });
  if (listError) throw listError;
  const storedNames = new Set((stored ?? []).map((f) => f.name));
  for (const part of parts) {
    if (!storedNames.has(part.path.split("/").pop()!)) {
      throw new Error(`Archive part missing after upload: ${part.path}`);
    }
  }

  const links: string[] = [];
  for (const part of parts) {
    const { data: signedUrlData, error: signError } = await supabaseAdmin.storage
      .from(ARCHIVES_BUCKET)
      .createSignedUrl(part.path, SIGNED_URL_TTL_SECONDS);
    if (signError || !signedUrlData?.signedUrl) {
      throw signError || new Error("Failed to create signed URL");
    }
    links.push(signedUrlData.signedUrl);
  }

  const downloadButtons =
    links.length === 1
      ? emailButton(links[0], "Download your photos")
      : `<p>Your photos are split into ${links.length} zip files so they download reliably. Please download all of them:</p>` +
        links.map((url, i) => emailButton(url, `Download part ${i + 1} of ${links.length}`)).join("");

  // Photos are only deleted after the email actually sends — if Resend is
  // down or the send fails, better to retry the whole thing tomorrow than
  // delete photos with no notice ever reaching the organizer.
  await sendEmail({
    to: profile.email,
    subject: `Your photos from "${event.name}" are ready to download`,
    html: wrapEmail(`
      ${emailHeading(`${event.name} &mdash; archive ready`)}
      <p>Hi ${profile.full_name || ""},</p>
      <p>Your event ended a while ago, so we've packaged all ${photos.length} photo${photos.length === 1 ? "" : "s"} into ${links.length === 1 ? "a zip file" : `${links.length} zip files`}.</p>
      ${downloadButtons}
      <p style="font-size:13px;color:#666666;">${links.length === 1 ? "This link expires" : "These links expire"} in 7 days.</p>
      ${emailFootnote(
        `To free up storage, the original photos have now been removed from Valere. This zip is the only remaining copy — please save it somewhere safe, as it will be permanently deleted ${ARCHIVE_PURGE_AFTER_DAYS} days from now.`
      )}
    `),
  });

  // Thumbnails (photo-thumbnails-2026-11.sql) are public copies of the photo, so
  // they go too. thumb_path is DB-constrained to "<storage_path>.thumb.jpg".
  const storagePaths = photos.flatMap((p) => [p.storage_path, p.thumb_path].filter(Boolean) as string[]);
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

// Second pass: permanently delete an event's archive zip once it's old
// enough (see ARCHIVE_PURGE_AFTER_DAYS above) — bounds total storage to a
// roughly steady-state amount instead of one that grows forever with
// all-time event volume, since archives used to be kept indefinitely.
async function purgeArchive(event: { id: string; name: string }) {
  // An event's archive is either the legacy single "<name>-archive.zip" or
  // several "-archive-partN.zip" files; everything under the event's folder
  // is its archive, so remove whatever is there.
  const { data: files } = await supabaseAdmin.storage.from(ARCHIVES_BUCKET).list(event.id, { limit: 1000 });
  const archivePaths = (files ?? []).map((f) => `${event.id}/${f.name}`);
  if (archivePaths.length === 0) archivePaths.push(`${event.id}/${sanitizeForPath(event.name)}-archive.zip`);

  const { error: removeError } = await supabaseAdmin.storage
    .from(ARCHIVES_BUCKET)
    .remove(archivePaths);

  if (removeError) {
    console.error(`Failed to remove archive for event ${event.id}:`, removeError);
  }

  await supabaseAdmin
    .from("events")
    .update({ archive_purged_at: new Date().toISOString() })
    .eq("id", event.id);

  return { eventId: event.id, status: "archive_purged" };
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
    .is("photos_purged_at", null)
    .order("expiry_date", { ascending: true })
    .limit(MAX_EVENTS_PER_RUN);

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

  // Second pass: permanently delete archives old enough per
  // ARCHIVE_PURGE_AFTER_DAYS. Cutoff-gated to archives created after
  // ARCHIVE_PURGE_CUTOFF so this doesn't mass-delete every pre-existing
  // archive the first time it runs.
  const archiveCutoff = new Date();
  archiveCutoff.setDate(archiveCutoff.getDate() - ARCHIVE_PURGE_AFTER_DAYS);

  const { data: archivedEvents, error: archivedEventsError } = await supabaseAdmin
    .from("events")
    .select("id, name")
    .not("photos_purged_at", "is", null)
    .is("archive_purged_at", null)
    .lt("photos_purged_at", archiveCutoff.toISOString())
    .gt("photos_purged_at", ARCHIVE_PURGE_CUTOFF);

  if (archivedEventsError) {
    console.error("Failed to query archives due for deletion:", archivedEventsError);
  }

  for (const event of archivedEvents || []) {
    try {
      results.push(await purgeArchive(event));
    } catch (error) {
      console.error(`Failed to purge archive for event ${event.id}:`, error);
      await supabaseAdmin.from("error_logs").insert({
        event_id: event.id,
        severity: "error",
        source: "purge-expired-events:purgeArchive",
        message: String((error as Error).message || error).slice(0, 2000),
      });
      results.push({ eventId: event.id, status: "archive_purge_failed" });
    }
  }

  // Orphan sweep: files in event-photos that no photos row references and that
  // are older than ORPHAN_MIN_AGE_DAYS (a failed upload whose rollback did not
  // run, a lost response, a thumbnail whose row update failed). The age guard
  // keeps an upload that is still being recorded safe. Removed through the
  // Storage API so the underlying object is freed (see storage-delete-policy-2026-11.sql).
  try {
    const { data: orphans, error: orphanListError } = await supabaseAdmin.rpc("list_orphan_event_photos", {
      p_older_than_days: ORPHAN_MIN_AGE_DAYS,
      p_limit: 100,
    });
    if (orphanListError) throw orphanListError;
    const orphanPaths = (orphans ?? []) as string[];
    if (orphanPaths.length > 0) {
      const { error: orphanRemoveError } = await supabaseAdmin.storage.from(PHOTOS_BUCKET).remove(orphanPaths);
      if (orphanRemoveError) throw orphanRemoveError;
      results.push({ status: "orphans_removed", count: orphanPaths.length });
    }
  } catch (error) {
    console.error("Orphan sweep failed:", error);
    await supabaseAdmin.from("error_logs").insert({
      severity: "error",
      source: "purge-expired-events:orphanSweep",
      message: String((error as Error).message || error).slice(0, 2000),
    });
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
});
