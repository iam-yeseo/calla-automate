-- Run after the security migrations. No external API calls; all test changes roll back.
begin;
do $$
declare role_name text; table_name text; permission text;
begin
  foreach role_name in array array['anon','authenticated'] loop
    foreach table_name in array array['product_lists','product_items','product_registrations','app_settings','product_indexing'] loop
      foreach permission in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
        if has_table_privilege(role_name,'public.'||table_name,permission) then
          raise exception 'Direct table permission leaked: % % %',role_name,table_name,permission;
        end if;
      end loop;
      if has_any_column_privilege(role_name,'public.'||table_name,'SELECT,INSERT,UPDATE,REFERENCES') then
        raise exception 'Direct column permission leaked: % %',role_name,table_name;
      end if;
      if not has_table_privilege('service_role','public.'||table_name,'SELECT,INSERT,UPDATE,DELETE') then
        raise exception 'Worker table permission missing: %',table_name;
      end if;
    end loop;
    if has_function_privilege(role_name,'public.save_product_draft(jsonb,jsonb,uuid[])','EXECUTE') then
      raise exception 'Direct draft RPC is exposed';
    end if;
    if has_function_privilege(role_name,'public.godomall_reserve_call(text)','EXECUTE') then
      raise exception 'Direct queue RPC is exposed';
    end if;
  end loop;
  if not has_function_privilege('service_role','public.save_product_draft(jsonb,jsonb,uuid[])','EXECUTE') then
    raise exception 'Worker draft RPC permission missing';
  end if;
  if (select count(*) from pg_policies where schemaname='storage' and tablename='objects' and permissive='RESTRICTIVE'
      and policyname in ('calla_thumbnail_insert_via_server','calla_thumbnail_update_via_server','calla_thumbnail_delete_via_server'))<>3 then
    raise exception 'Thumbnail write restrictions missing';
  end if;
  if not (select public from storage.buckets where id='product-thumbnails') then
    raise exception 'Existing public thumbnail reads changed';
  end if;
end $$;
set local role service_role;
do $$
declare deadline timestamptz; first_call timestamptz; second_call timestamptz; rejected boolean;
begin
  update public.godomall_mall_state set next_call_at=clock_timestamp()+interval '60 seconds'
    where mall_id='retail' returning next_call_at into deadline;
  for i in 1..200 loop
    rejected:=false;
    begin perform public.godomall_reserve_call('retail'); exception when sqlstate 'PT429' then rejected:=true; end;
    if not rejected then raise exception 'Overloaded queue accepted work'; end if;
  end loop;
  if (select next_call_at from public.godomall_mall_state where mall_id='retail')<>deadline then
    raise exception 'Rejected calls extended the queue';
  end if;
  update public.godomall_mall_state set next_call_at=clock_timestamp()-interval '1 second' where mall_id='retail';
  first_call:=public.godomall_reserve_call('retail'); second_call:=public.godomall_reserve_call('retail');
  if second_call-first_call<>interval '300 milliseconds' then raise exception 'Normal reservations lost spacing'; end if;
end $$;
rollback;
