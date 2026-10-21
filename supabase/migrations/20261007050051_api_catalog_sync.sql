-- Resumable API reads publish each mall's complete tree atomically.
create table public.godomall_taxonomy_sync (
  mall_id text not null check (mall_id in ('retail','wholesale')),
  kind text not null check (kind in ('categories','brands')),
  status text not null check (status in ('syncing','success','failed')),
  pending jsonb not null default '[""]',
  visited jsonb not null default '[]',
  collected jsonb not null default '[]',
  updated_at timestamptz not null default now(),
  synced_at timestamptz,
  error_message text,
  primary key(mall_id,kind)
);
alter table public.godomall_taxonomy_sync enable row level security;
revoke all on public.godomall_taxonomy_sync from public,anon,authenticated;
grant select,insert,update,delete on public.godomall_taxonomy_sync to service_role;

create function public.godomall_publish_taxonomy(p_mall text,p_kind text,p_revision timestamptz,p_items jsonb,p_visited jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare sync public.godomall_taxonomy_sync; settings_row public.app_settings; next_value jsonb; rows jsonb; old_rows jsonb; stamp timestamptz:=clock_timestamp();
begin
  select * into sync from public.godomall_taxonomy_sync where mall_id=p_mall and kind=p_kind for update;
  if not found then raise exception 'unknown sync'; end if;
  if sync.updated_at is distinct from p_revision or sync.status='success' then return to_jsonb(sync); end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)>5000 or (p_kind='categories' and jsonb_array_length(p_items)=0) then raise exception 'invalid taxonomy'; end if;
  select * into settings_row from public.app_settings where key='product_automation_v1' for update;
  if not found then raise exception 'settings missing'; end if;
  next_value:=settings_row.value;
  if p_kind='categories' then
    old_rows:=coalesce(next_value->'categories'->p_mall,'[]');
    select coalesce(jsonb_agg(item || case when old_item ? 'folder' then jsonb_build_object('folder',old_item->'folder') else '{}' end order by item->>'code'),'[]') into rows
      from jsonb_array_elements(p_items) item
      left join lateral (select old_item from jsonb_array_elements(old_rows) old_item where old_item->>'code'=item->>'code' limit 1) old on true;
    next_value:=jsonb_set(next_value,array['categories',p_mall],rows);
  else
    old_rows:=coalesce(next_value->'brandsByMall'->p_mall,'[]');
    select coalesce(jsonb_agg(item || case when old_item ? 'aliases' then jsonb_build_object('aliases',old_item->'aliases') else '{}' end order by item->>'code'),'[]') into rows
      from jsonb_array_elements(p_items) item
      left join lateral (select old_item from jsonb_array_elements(old_rows) old_item where old_item->>'code'=item->>'code' and old_item->>'name'=item->>'name' limit 1) old on true;
    next_value:=jsonb_set(next_value,'{brandsByMall}',jsonb_set(coalesce(next_value->'brandsByMall','{}'),array[p_mall],rows));
  end if;
  next_value:=jsonb_set(next_value,'{taxonomySyncedAt}',jsonb_set(coalesce(next_value->'taxonomySyncedAt','{}'),array[p_mall],jsonb_set(coalesce(next_value->'taxonomySyncedAt'->p_mall,'{}'),array[p_kind],to_jsonb(stamp))));
  update public.app_settings set value=next_value,updated_at=stamp where key='product_automation_v1';
  update public.godomall_taxonomy_sync set status='success',collected=p_items,pending='[]',visited=p_visited,error_message=null,synced_at=stamp,updated_at=stamp
    where mall_id=p_mall and kind=p_kind returning * into sync;
  return to_jsonb(sync);
end;
$$;
revoke all on function public.godomall_publish_taxonomy(text,text,timestamptz,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.godomall_publish_taxonomy(text,text,timestamptz,jsonb,jsonb) to service_role;
