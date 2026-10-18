-- ============================================================================
-- Wedding HQ (2026-10b) — defence-in-depth CHECK constraints.
--
-- Follow-up to wedding-hq-2026-10.sql after the phase 2 security review. The
-- app already only writes valid values; these make the DATABASE refuse the rest
-- even if someone calls the REST API directly:
--   * a category colour must be #rrggbb (it ends up in a style attribute)
--   * a stored file path must live under the row's own wedding folder
--     ("<wedding_id>/..."), matching the wedding-files storage policy
--
-- Additive and idempotent (each constraint is added only if missing).
-- Apply after wedding-hq-2026-10.sql. See SUPABASE_SETUP.md.
--
-- ROLLBACK: alter table <t> drop constraint <name>; for each name below.
-- ============================================================================

do $$
declare
  spec record;
begin
  for spec in
    select * from (values
      ('wedding_categories',     'wedding_categories_color_hex',   $c$color is null or color ~ '^#[0-9a-fA-F]{6}$'$c$),
      ('wedding_quotes',         'wedding_quotes_path_own',        $c$attachment_path is null or attachment_path like wedding_id::text || '/%'$c$),
      ('wedding_invoices',       'wedding_invoices_path_own',      $c$attachment_path is null or attachment_path like wedding_id::text || '/%'$c$),
      ('wedding_payments',       'wedding_payments_path_own',      $c$proof_path is null or proof_path like wedding_id::text || '/%'$c$),
      ('wedding_bookings',       'wedding_bookings_path_own',      $c$attachment_path is null or attachment_path like wedding_id::text || '/%'$c$),
      ('wedding_purchase_items', 'wedding_purchase_items_path_own',$c$receipt_path is null or receipt_path like wedding_id::text || '/%'$c$)
    ) as t(tbl, name, expr)
  loop
    if not exists (
      select 1 from pg_constraint
       where conname = spec.name and conrelid = ('public.' || spec.tbl)::regclass
    ) then
      execute format('alter table public.%I add constraint %I check (%s)', spec.tbl, spec.name, spec.expr);
    end if;
  end loop;
end
$$;
