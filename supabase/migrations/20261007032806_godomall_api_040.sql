-- CALLA 0.4.0: server-only API receipts, mall-scoped snapshots and operation claims.
-- Existing list/item schema, RLS policies and legacy Chrome registration contract are unchanged.
create table public.godomall_mall_state (
  mall_id text primary key check (mall_id in ('retail','wholesale')),
  next_call_at timestamptz not null default now(),
  connection_state text not null default 'unchecked',
  checked_at timestamptz,
  message text,
  error_code text
);
insert into public.godomall_mall_state(mall_id) values ('retail'),('wholesale');

create table public.godomall_products (
  mall_id text not null check (mall_id in ('retail','wholesale')),
  goods_no text not null check (goods_no ~ '^[0-9]{1,20}$'),
  snapshot jsonb not null,
  raw_xml text not null,
  checked_at timestamptz not null,
  deleted boolean not null default false,
  primary key(mall_id,goods_no)
);

create table public.godomall_operations (
  id uuid primary key,
  mall_id text not null check (mall_id in ('retail','wholesale')),
  kind text not null check (kind in ('insert','update','delete')),
  state text not null default 'prepared' check (state in ('prepared','sending','verifying','success','failed','needs_review')),
  item_id uuid references public.product_items(id) on delete set null,
  goods_no text check (goods_no is null or goods_no ~ '^[0-9]{1,20}$'),
  target_key text not null,
  title text not null,
  marker text,
  created_by uuid not null,
  source_revision timestamptz,
  fingerprint text,
  changes jsonb not null default '[]',
  warnings jsonb not null default '[]',
  expected jsonb not null default '{}',
  payload_xml text,
  payload_token_hash text,
  payload_expires_at timestamptz,
  response_code text,
  acknowledged_goods_no text,
  error_message text,
  verification_attempts integer not null default 0,
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '20 minutes')
);
create index godomall_operations_history on public.godomall_operations(mall_id,created_at desc,id);
create index godomall_operations_item on public.godomall_operations(item_id,mall_id);
create index godomall_operations_goods on public.godomall_operations(mall_id,goods_no);
create unique index godomall_operations_active_target on public.godomall_operations(mall_id,target_key)
  where state in ('sending','verifying','needs_review');
create unique index godomall_operations_active_goods on public.godomall_operations(mall_id,goods_no)
  where goods_no is not null and state in ('sending','verifying','needs_review');

create table public.godomall_links (
  item_id uuid not null references public.product_items(id) on delete cascade,
  mall_id text not null check (mall_id in ('retail','wholesale')),
  goods_no text,
  api_state text not null default 'unknown' check (api_state in ('unknown','verifying','verified','failed','needs_review','deleted')),
  last_action text,
  last_operation_id uuid references public.godomall_operations(id),
  checked_at timestamptz,
  error_message text,
  updated_at timestamptz not null default now(),
  primary key(item_id,mall_id)
);
create index godomall_links_goods on public.godomall_links(mall_id,goods_no);
create index godomall_links_operation on public.godomall_links(last_operation_id);
-- Only existing explicit mappings are carried over. Names/numbers across malls are never matched.
insert into public.godomall_links(item_id,mall_id,goods_no)
select item_id,channel,goods_no from public.product_registrations where goods_no ~ '^[0-9]{1,20}$';

alter table public.godomall_mall_state enable row level security;
alter table public.godomall_products enable row level security;
alter table public.godomall_operations enable row level security;
alter table public.godomall_links enable row level security;
revoke all on public.godomall_mall_state,public.godomall_products,public.godomall_operations,public.godomall_links from public,anon,authenticated;
grant select,insert,update,delete on public.godomall_mall_state,public.godomall_products,public.godomall_operations,public.godomall_links to service_role;

create function public.godomall_reserve_call(p_mall text) returns timestamptz
language plpgsql security invoker set search_path='' as $$
declare reserved timestamptz;
begin
  update public.godomall_mall_state set next_call_at=greatest(next_call_at,clock_timestamp())+interval '300 milliseconds'
    where mall_id=p_mall returning next_call_at-interval '300 milliseconds' into reserved;
  if reserved is null then raise exception 'unknown mall'; end if;
  return reserved;
end;
$$;
create function public.godomall_pause_calls(p_mall text,p_milliseconds integer) returns void
language sql security invoker set search_path='' as $$
  update public.godomall_mall_state set next_call_at=greatest(next_call_at,clock_timestamp()+least(greatest(p_milliseconds,2000),3600000)*interval '1 millisecond') where mall_id=p_mall;
$$;

create function public.godomall_begin_operation(p_id uuid,p_actor uuid,p_token_hash text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare op public.godomall_operations; it public.product_items; reg public.product_registrations; link public.godomall_links;
begin
  select * into op from public.godomall_operations where id=p_id for update;
  if not found or op.created_by<>p_actor then raise exception 'operation unavailable'; end if;
  if op.state<>'prepared' then return jsonb_build_object('started',false,'operation',to_jsonb(op)); end if;
  if op.expires_at<now() then raise exception 'preview expired'; end if;
  if op.kind='insert' then
    select * into it from public.product_items where id=op.item_id for update;
    if not found or it.updated_at is distinct from op.source_revision then raise exception 'source changed'; end if;
    select * into link from public.godomall_links where item_id=op.item_id and mall_id=op.mall_id for update;
    select * into reg from public.product_registrations where item_id=op.item_id and channel=op.mall_id for update;
    if (reg.status in ('running','success') or reg.goods_no is not null) and coalesce(link.api_state,'unknown')<>'deleted' then raise exception 'registration already exists'; end if;
    if link.api_state in ('verifying','verified','needs_review') then raise exception 'registration locked'; end if;
    insert into public.product_registrations(item_id,channel,status,goods_no,error_message,warnings,attempted_at,updated_at)
      values(op.item_id,op.mall_id,'running',null,null,'[]',now(),now())
      on conflict(item_id,channel) do update set status='running',goods_no=null,error_message=null,warnings='[]',attempted_at=now(),updated_at=now();
    insert into public.godomall_links(item_id,mall_id,goods_no,api_state,last_action,last_operation_id,updated_at)
      values(op.item_id,op.mall_id,null,'verifying',op.kind,op.id,now())
      on conflict(item_id,mall_id) do update set goods_no=null,api_state='verifying',last_action=op.kind,last_operation_id=op.id,error_message=null,updated_at=now();
  else
    if exists(select 1 from public.godomall_links l join public.product_registrations r on r.item_id=l.item_id and r.channel=l.mall_id
      where l.mall_id=op.mall_id and l.goods_no=op.goods_no and r.status='running') then raise exception 'legacy registration in progress'; end if;
    update public.godomall_links set api_state='verifying',last_action=op.kind,last_operation_id=op.id,error_message=null,updated_at=now()
      where mall_id=op.mall_id and goods_no=op.goods_no;
  end if;
  update public.godomall_operations set state='sending',updated_at=now(),payload_token_hash=p_token_hash,payload_expires_at=now()+interval '10 minutes'
    where id=p_id returning * into op;
  return jsonb_build_object('started',true,'operation',to_jsonb(op));
end;
$$;

create function public.godomall_finish_operation(p_id uuid,p_state text,p_goods_no text,p_error text,p_snapshot jsonb,p_raw_xml text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare op public.godomall_operations; link_state text; registration_state text;
begin
  if p_state not in ('success','failed','needs_review') then raise exception 'invalid final state'; end if;
  select * into op from public.godomall_operations where id=p_id for update;
  if not found then raise exception 'unknown operation'; end if;
  if op.state in ('success','failed') then return to_jsonb(op); end if;
  if op.state not in ('sending','verifying','needs_review') then raise exception 'operation not started'; end if;
  if p_state='success' and (p_goods_no is null or p_goods_no !~ '^[0-9]{1,20}$') then raise exception 'verified goods required'; end if;
  if p_state='success' and op.kind='delete' and (op.response_code is distinct from '000' or op.acknowledged_goods_no is distinct from p_goods_no) then raise exception 'delete receipt required'; end if;
  if p_state='success' and op.kind<>'delete' and (p_snapshot is null or p_raw_xml is null) then raise exception 'verification snapshot required'; end if;
  update public.godomall_operations set state=p_state,goods_no=coalesce(p_goods_no,goods_no),error_message=p_error,
    checked_at=case when p_state='success' then now() else checked_at end,updated_at=now(),payload_expires_at=now()
    where id=p_id returning * into op;
  if p_state='success' and op.kind='delete' then
    update public.godomall_products set deleted=true,checked_at=now() where mall_id=op.mall_id and goods_no=op.goods_no;
  elsif p_state='success' then
    insert into public.godomall_products(mall_id,goods_no,snapshot,raw_xml,checked_at,deleted)
      values(op.mall_id,op.goods_no,p_snapshot,p_raw_xml,now(),false)
      on conflict(mall_id,goods_no) do update set snapshot=excluded.snapshot,raw_xml=excluded.raw_xml,checked_at=excluded.checked_at,deleted=false;
  end if;
  link_state:=case when p_state='success' then case when op.kind='delete' then 'deleted' else 'verified' end else p_state end;
  update public.godomall_links set goods_no=coalesce(op.goods_no,goods_no),api_state=link_state,error_message=p_error,
    checked_at=case when p_state='success' then now() else checked_at end,updated_at=now()
    where last_operation_id=op.id;
  -- Keep the old runner contract in sync; its existing running state blocks blind retry.
  registration_state:=case when p_state='success' then case when op.kind='delete' then 'pending' else 'success' end when p_state='failed' and op.kind='insert' then 'failed' when p_state='needs_review' then 'running' else null end;
  if registration_state is not null then
    update public.product_registrations r set status=registration_state,goods_no=coalesce(op.goods_no,r.goods_no),
      error_message=p_error,warnings=op.warnings,updated_at=now()
      from public.godomall_links l where l.item_id=r.item_id and l.mall_id=r.channel and l.last_operation_id=op.id;
  end if;
  return to_jsonb(op);
end;
$$;
revoke all on function public.godomall_reserve_call(text),public.godomall_pause_calls(text,integer),public.godomall_begin_operation(uuid,uuid,text),public.godomall_finish_operation(uuid,text,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.godomall_reserve_call(text),public.godomall_pause_calls(text,integer),public.godomall_begin_operation(uuid,uuid,text),public.godomall_finish_operation(uuid,text,text,text,jsonb,text) to service_role;
