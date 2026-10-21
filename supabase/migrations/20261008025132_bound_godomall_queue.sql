-- Bound durable admission before consuming shared Godomall capacity.
begin;
create or replace function public.godomall_reserve_call(p_mall text)
returns timestamptz language plpgsql security invoker set search_path='' as $$
declare reserved timestamptz; current_time_utc timestamptz;
begin
  select next_call_at into reserved from public.godomall_mall_state
    where mall_id=p_mall for update;
  if not found then raise exception 'unknown mall'; end if;
  current_time_utc := clock_timestamp();
  if reserved > current_time_utc + interval '5 seconds' then
    raise sqlstate 'PT429' using message='Godomall queue is full';
  end if;
  reserved := greatest(reserved, current_time_utc);
  update public.godomall_mall_state
    set next_call_at=reserved+interval '300 milliseconds' where mall_id=p_mall;
  return reserved;
end;
$$;
revoke all on function public.godomall_reserve_call(text) from public, anon, authenticated;
grant execute on function public.godomall_reserve_call(text) to service_role;
commit;
