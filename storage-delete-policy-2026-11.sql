-- ============================================================================
-- event-photos: make the app's own storage removals work, and sweep orphans (Nov 2026)
--
-- BUG: the 'event-photos' bucket had INSERT and SELECT policies but no DELETE
-- policy, so every supabase.storage.remove() from the browser was a silent no-op
-- (Storage returns success with nothing removed when RLS hides every row):
--   * the upload rollback (photos insert failed -> remove the file) never worked,
--     leaving orphan files (8 found, ~21 MB; all failed/blocked test uploads);
--   * an organizer's "Delete photo" removed the database row but left the file
--     in the bucket, still reachable by its public URL.
--
-- FIX 1 (policy): two narrow cases, enforced here, not in app code:
--   a. the creator of an event may remove any object under that event's folder
--      (<event_id>/...), photos and thumbnails alike;
--   b. a user may remove an object THEY uploaded (owner_id) only while NO photos
--      row references it (storage_path or thumb_path), i.e. the rollback of a
--      failed upload. A guest therefore cannot remove a photo that is in a gallery.
--   The "is referenced" check is a SECURITY DEFINER helper because the photos
--   table is row-level-secured: a plain subquery would only see rows the caller
--   can read, and wrongly treat a hidden row as "unreferenced".
--   NOTE: inside the events subquery the file name MUST be written objects.name;
--   a bare "name" resolves to events.name and silently breaks the owner case.
-- FIX 2 (sweep): list_orphan_event_photos() lists unreferenced files older than N
--   days for the purge-expired-events Edge Function (service role only), which
--   removes them through the Storage API (never delete storage rows with SQL).
--
-- Idempotent. Apply as one statement. ROLLBACK: remove the policy
-- "event_photos_remove_owner_or_unreferenced_own" and the two functions.
-- ============================================================================

create or replace function public.event_photo_path_is_referenced(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.photos p
    where p.storage_path = p_name or p.thumb_path = p_name
  );
$$;

revoke all on function public.event_photo_path_is_referenced(text) from public, anon;
grant execute on function public.event_photo_path_is_referenced(text) to authenticated, service_role;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'event_photos_remove_owner_or_unreferenced_own'
  ) then
    create policy "event_photos_remove_owner_or_unreferenced_own"
      on storage.objects
      for delete
      to authenticated
      using (false);
  end if;
end
$$;

alter policy "event_photos_remove_owner_or_unreferenced_own"
  on storage.objects
  using (
    bucket_id = 'event-photos'
    and (
      exists (
        select 1 from public.events e
        where e.id::text = (storage.foldername(objects.name))[1]
          and e.created_by = auth.uid()
      )
      or (
        owner_id = auth.uid()::text
        and not public.event_photo_path_is_referenced(objects.name)
      )
    )
  );

create index if not exists photos_storage_path_idx on public.photos (storage_path);
create index if not exists photos_thumb_path_idx on public.photos (thumb_path) where thumb_path is not null;

create or replace function public.list_orphan_event_photos(p_older_than_days integer default 7, p_limit integer default 100)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'event-photos'
    and o.created_at < now() - make_interval(days => greatest(p_older_than_days, 1))
    and o.name not like '%.emptyFolderPlaceholder'
    and not exists (
      select 1 from public.photos p
      where p.storage_path = o.name or p.thumb_path = o.name
    )
  order by o.created_at
  limit least(greatest(p_limit, 1), 500);
$$;

revoke all on function public.list_orphan_event_photos(integer, integer) from public, anon, authenticated;
grant execute on function public.list_orphan_event_photos(integer, integer) to service_role;

notify pgrst, 'reload schema';
