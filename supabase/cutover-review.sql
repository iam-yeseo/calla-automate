-- HISTORICAL REVIEW: superseded by migrations/20261008024948_close_direct_product_access.sql.
-- The applied migration also covers product_indexing; do not use this incomplete historical script for new cutovers.
-- REVIEW ONLY. Not applied by this task. This is a coordinated access cutover,
-- not a data migration and not an automatically executed migration file.
-- Preconditions:
-- 1. Back up current grants/policies and verify the deployed Worker with a
--    server-only service key and real admin/viewer Supabase Auth users.
-- 2. Stop the old public CALLTO editor and old direct-DB automation runner.
-- 3. Move users and the local Chrome runner to the authenticated Worker API.
-- 4. Verify the current policy/table/function names against the live database.
-- No product, list, registration, setting, image or Auth user is deleted here.

begin;

alter table public.product_lists enable row level security;
alter table public.product_items enable row level security;
alter table public.product_registrations enable row level security;
alter table public.app_settings enable row level security;

-- Browser/runner traffic goes through the role-checked Worker BFF.
-- The old anonymous browser and publishable-key-only runner stop working.
revoke all privileges on table
  public.product_lists, public.product_items,
  public.product_registrations, public.app_settings
from public, anon, authenticated;

grant select, insert, update, delete on table
  public.product_lists, public.product_items,
  public.product_registrations, public.app_settings
to service_role;

drop policy if exists product_lists_anon_all on public.product_lists;
drop policy if exists product_items_anon_all on public.product_items;
drop policy if exists product_registrations_anon_all on public.product_registrations;
drop policy if exists app_settings_anon_all on public.app_settings;

revoke all on function public.save_product_draft(jsonb, jsonb, uuid[])
from public, anon, authenticated;
grant execute on function public.save_product_draft(jsonb, jsonb, uuid[])
to service_role;

-- Restrict writes only to this bucket. Other application buckets retain their
-- existing policies and privileges. Public thumbnail reads remain unchanged.
drop policy if exists product_thumbnail_insert on storage.objects;
drop policy if exists calla_thumbnail_insert_via_server on storage.objects;
drop policy if exists calla_thumbnail_update_via_server on storage.objects;
drop policy if exists calla_thumbnail_delete_via_server on storage.objects;
create policy calla_thumbnail_insert_via_server on storage.objects
  as restrictive for insert to anon, authenticated
  with check (bucket_id <> 'product-thumbnails');
create policy calla_thumbnail_update_via_server on storage.objects
  as restrictive for update to anon, authenticated
  using (bucket_id <> 'product-thumbnails')
  with check (bucket_id <> 'product-thumbnails');
create policy calla_thumbnail_delete_via_server on storage.objects
  as restrictive for delete to anon, authenticated
  using (bucket_id <> 'product-thumbnails');

-- The existing service-only thumbnail cleanup RPCs, Storage public flag,
-- cron schedule and all existing data remain in place.
commit;

-- Post-cutover verification (read-only):
-- select grantee, table_name, privilege_type
-- from information_schema.role_table_grants
-- where table_schema = 'public'
--   and table_name in ('product_lists','product_items','product_registrations','app_settings')
-- order by table_name, grantee, privilege_type;
-- select tablename, policyname, roles, cmd, qual, with_check
-- from pg_policies where schemaname in ('public','storage');
-- Then exercise allow/deny API tests as real admin, viewer and signed-out users.
