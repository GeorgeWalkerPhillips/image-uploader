-- ============================================================================
-- Photo thumbnails (Nov 2026)
--
-- WHY: the gallery grid loaded every full-resolution original (avg ~4.5 MB) as a
-- tile, which pushed the project to 97% of the Free plan's 5 GB "Cached Egress"
-- quota. The grid now loads a ~600px JPEG thumbnail (~40-80 KB) instead; the
-- full photo is only fetched when someone opens it.
--
-- WHAT: photos.thumb_path = storage path of that thumbnail in the same
-- 'event-photos' bucket. NULL = no thumbnail yet (old photos; the event owner's
-- gallery fills these in lazily) and the app falls back to the original.
--
-- SECURITY: the CHECK pins thumb_path to exactly "<this row's storage_path>.thumb.jpg",
-- so a client can never point a row at another photo/event's file (server-side
-- code such as the purge job removes thumb_path objects with the service role).
-- No new storage policy is needed: authenticated users can already upload to
-- 'event-photos' and everything in it is public-read, same as the originals.
-- Thumbnails are storage objects only (no photos row), so the per-guest photo
-- cap triggers are unaffected.
--
-- Idempotent. Apply as one statement. ROLLBACK: remove the constraint and column.
-- ============================================================================

alter table public.photos add column if not exists thumb_path text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'photos_thumb_path_matches_storage_path'
      and conrelid = 'public.photos'::regclass
  ) then
    alter table public.photos
      add constraint photos_thumb_path_matches_storage_path
      check (thumb_path is null or thumb_path = storage_path || '.thumb.jpg');
  end if;
end
$$;

notify pgrst, 'reload schema';
