-- Close direct product access. Current web, Mac and recovery runner use the
-- authenticated Worker API; service_role remains the sole data writer.
-- The public thumbnail bucket remains readable. No application data is changed.
begin;
alter table public.product_lists enable row level security;
alter table public.product_items enable row level security;
alter table public.product_registrations enable row level security;
alter table public.app_settings enable row level security;
alter table public.product_indexing enable row level security;

revoke all privileges on table
  public.product_lists, public.product_items, public.product_registrations,
  public.app_settings, public.product_indexing
from public, anon, authenticated;
grant select, insert, update, delete on table
  public.product_lists, public.product_items, public.product_registrations,
  public.app_settings, public.product_indexing
to service_role;

drop policy if exists product_lists_anon_all on public.product_lists;
drop policy if exists product_items_anon_all on public.product_items;
drop policy if exists product_registrations_anon_all on public.product_registrations;
drop policy if exists app_settings_anon_all on public.app_settings;
drop policy if exists product_indexing_anon_all on public.product_indexing;

revoke all on function public.save_product_draft(jsonb, jsonb, uuid[])
from public, anon, authenticated;
grant execute on function public.save_product_draft(jsonb, jsonb, uuid[])
to service_role;

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
commit;
