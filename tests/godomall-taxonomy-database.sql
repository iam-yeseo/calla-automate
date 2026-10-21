begin;
set local role service_role;
do $$
declare original jsonb; actual jsonb; revision timestamptz; result jsonb;
begin
  if has_table_privilege('authenticated','public.godomall_taxonomy_sync','SELECT') or has_function_privilege('authenticated','public.godomall_publish_taxonomy(text,text,timestamptz,jsonb,jsonb)','EXECUTE') then raise exception 'Taxonomy staging exposed'; end if;
  select value into original from public.app_settings where key='product_automation_v1';
  update public.app_settings set value=jsonb_set(original,'{categories,retail}','[{"code":"991","name":"Old","parentCode":"","folder":"audio"}]') where key='product_automation_v1';
  insert into public.godomall_taxonomy_sync(mall_id,kind,status) values('retail','categories','syncing') on conflict(mall_id,kind) do update set status='syncing',updated_at=clock_timestamp() returning updated_at into revision;
  result:=public.godomall_publish_taxonomy('retail','categories',revision,'[{"code":"991","name":"Updated","parentCode":""},{"code":"991001","name":"Child","parentCode":"991"}]','["","991","991001"]');
  if result->>'status'<>'success' then raise exception 'Publish did not finish'; end if;
  select value into actual from public.app_settings where key='product_automation_v1';
  if actual->'categories'->'retail'->0->>'folder'<>'audio' then raise exception 'Image folder lost'; end if;
  if actual->'categories'->'wholesale' is distinct from original->'categories'->'wholesale' or actual->'folders' is distinct from original->'folders' or actual->'brands' is distinct from original->'brands' then raise exception 'Other settings changed'; end if;
  if actual->'taxonomySyncedAt'->'retail'->>'categories' is null then raise exception 'No sync stamp'; end if;
  perform public.godomall_publish_taxonomy('retail','categories',revision,'[{"code":"999","name":"Stale","parentCode":""}]','[""]');
  if (select value->'categories'->'retail'->0->>'code' from public.app_settings where key='product_automation_v1')<>'991' then raise exception 'Stale publication overwrote settings'; end if;
  insert into public.godomall_taxonomy_sync(mall_id,kind,status) values('wholesale','brands','syncing') on conflict(mall_id,kind) do update set status='syncing',updated_at=clock_timestamp() returning updated_at into revision;
  perform public.godomall_publish_taxonomy('wholesale','brands',revision,'[{"code":"027","name":"CALLA","parentCode":""}]','["","027"]');
  if (select value->'brandsByMall'->'wholesale'->0->>'code' from public.app_settings where key='product_automation_v1')<>'027' then raise exception 'Wholesale brand not saved'; end if;
  if (select value->'categories'->'retail' from public.app_settings where key='product_automation_v1') is distinct from actual->'categories'->'retail' then raise exception 'Brand refresh changed categories'; end if;
end;
$$;
rollback;
