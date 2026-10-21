-- Run against the applied schema. Everything created here rolls back, including trigger changes.
-- No external API is called. Any failed assertion aborts the transaction.
begin;
set local role service_role;
do $$
<<godomall_test>>
declare
  list_id uuid := gen_random_uuid(); item_id uuid := gen_random_uuid(); actor uuid := gen_random_uuid();
  retail_op uuid := gen_random_uuid(); wholesale_op uuid := gen_random_uuid(); duplicate_op uuid := gen_random_uuid(); delete_op uuid := gen_random_uuid();
  revision timestamptz; result jsonb; rejected boolean; first_call timestamptz; second_call timestamptz;
begin
  if has_table_privilege('anon','public.godomall_operations','SELECT') or has_table_privilege('authenticated','public.godomall_products','SELECT')
    or has_function_privilege('authenticated','public.godomall_begin_operation(uuid,uuid,text)','EXECUTE') then
    raise exception 'Godomall private storage is exposed';
  end if;
  insert into public.product_lists(id,title) values(list_id,'TRANSACTIONAL TEST - ROLLED BACK');
  insert into public.product_items(id,list_id,name_own,need_retail,need_wholesale) values(item_id,list_id,'TRANSACTIONAL TEST','필요','필요') returning updated_at into revision;
  insert into public.godomall_operations(id,mall_id,kind,item_id,target_key,title,created_by,source_revision,payload_xml)
    values(retail_op,'retail','insert',item_id,'item:'||item_id,'TEST',actor,revision,'<data/>'),
          (wholesale_op,'wholesale','insert',item_id,'item:'||item_id,'TEST',actor,revision,'<data/>'),
          (duplicate_op,'retail','insert',item_id,'item:'||item_id,'TEST',actor,revision,'<data/>');
  rejected:=false;
  begin perform public.godomall_begin_operation(retail_op,gen_random_uuid(),'hash'); exception when raise_exception then rejected:=true; end;
  if not rejected then raise exception 'Owner guard failed'; end if;
  update public.godomall_operations set source_revision=revision-interval '1 second' where id=retail_op;
  rejected:=false;
  begin perform public.godomall_begin_operation(retail_op,actor,'hash'); exception when raise_exception then rejected:=true; end;
  if not rejected then raise exception 'Source revision guard failed'; end if;
  update public.godomall_operations set source_revision=revision where id=retail_op;
  result:=public.godomall_begin_operation(retail_op,actor,'hash');
  if not (result->>'started')::boolean then raise exception 'Retail operation did not start'; end if;
  result:=public.godomall_begin_operation(retail_op,actor,'different-hash');
  if (result->>'started')::boolean then raise exception 'Idempotent execution guard failed'; end if;
  rejected:=false;
  begin perform public.godomall_begin_operation(duplicate_op,actor,'hash'); exception when raise_exception or unique_violation then rejected:=true; end;
  if not rejected then raise exception 'Duplicate registration guard failed'; end if;
  result:=public.godomall_begin_operation(wholesale_op,actor,'hash');
  if not (result->>'started')::boolean then raise exception 'Independent wholesale operation blocked'; end if;
  result:=public.godomall_finish_operation(retail_op,'needs_review',null,'Response lost',null,null);
  if result->>'state'<>'needs_review' then raise exception 'Uncertainty lost'; end if;
  if (select status from public.product_registrations r where r.item_id=godomall_test.item_id and channel='retail')<>'running' then raise exception 'Legacy retry is not blocked'; end if;
  rejected:=false;
  begin perform public.godomall_finish_operation(retail_op,'success','9999999001',null,null,null); exception when raise_exception then rejected:=true; end;
  if not rejected then raise exception 'Unverified success accepted'; end if;
  result:=public.godomall_finish_operation(retail_op,'success','9999999001',null,'{"mallId":"retail","goodsNo":"9999999001","price":1000}','<goods_data/>');
  result:=public.godomall_finish_operation(wholesale_op,'success','9999999001',null,'{"mallId":"wholesale","goodsNo":"9999999001","price":800}','<goods_data/>');
  if (select count(*) from public.godomall_products where goods_no='9999999001')<>2 then raise exception 'Mall goods identity collision'; end if;
  if (select count(*) from public.godomall_links l where l.item_id=godomall_test.item_id and api_state='verified')<>2 then raise exception 'Verified links not persisted'; end if;
  if (select count(*) from public.product_registrations r where r.item_id=godomall_test.item_id and status='success')<>2 then raise exception 'Legacy registration synchronization failed'; end if;
  result:=public.godomall_finish_operation(retail_op,'failed',null,'Late failure',null,null);
  if result->>'state'<>'success' then raise exception 'Final success overwritten'; end if;
  insert into public.godomall_operations(id,mall_id,kind,item_id,goods_no,target_key,title,created_by)
    values(delete_op,'retail','delete',item_id,'9999999001','goods:9999999001','TEST',actor);
  perform public.godomall_begin_operation(delete_op,actor,'hash');
  rejected:=false;
  begin perform public.godomall_finish_operation(delete_op,'success','9999999001',null,null,null); exception when raise_exception then rejected:=true; end;
  if not rejected then raise exception 'Delete without receipt accepted'; end if;
  update public.godomall_operations set response_code='000',acknowledged_goods_no='9999999001' where id=delete_op;
  perform public.godomall_finish_operation(delete_op,'success','9999999001',null,null,null);
  if not (select deleted from public.godomall_products where mall_id='retail' and goods_no='9999999001') then raise exception 'Delete cache not updated'; end if;
  if (select api_state from public.godomall_links l where l.item_id=godomall_test.item_id and mall_id='retail')<>'deleted' then raise exception 'Delete link not updated'; end if;
  if (select api_state from public.godomall_links l where l.item_id=godomall_test.item_id and mall_id='wholesale')<>'verified' then raise exception 'Other mall modified'; end if;
  if exists(select 1 from public.godomall_operations where id in (retail_op,wholesale_op,delete_op) and payload_expires_at>now()) then raise exception 'Payload capability not expired'; end if;
  first_call:=public.godomall_reserve_call('retail'); second_call:=public.godomall_reserve_call('retail');
  if second_call-first_call<interval '300 milliseconds' then raise exception 'Rate reservation not serialized'; end if;
  perform public.godomall_pause_calls('wholesale',10000);
  if (select next_call_at from public.godomall_mall_state where mall_id='wholesale')<clock_timestamp()+interval '9 seconds' then raise exception 'Rate pause failed'; end if;
  -- Deleting only this test source must retain operation receipts via ON DELETE SET NULL.
  delete from public.product_items p where p.id=godomall_test.item_id;
  if (select count(*) from public.godomall_operations o where id in (retail_op,wholesale_op,delete_op) and o.item_id is null)<>3 then raise exception 'Audit trail removed with source'; end if;
end;
$$;
rollback;
