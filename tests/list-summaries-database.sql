-- Minimal schema for list-summaries-database.mjs in an isolated PGlite database.
-- This is a test fixture, not a production migration.
create role anon;
create role authenticated;
create role unprivileged;
create role service_role bypassrls;

create table public.product_lists (
  id uuid primary key,
  title text not null,
  author text not null default '',
  work_date date,
  note text not null default '',
  created_at timestamptz not null,
  updated_at timestamptz
);
create table public.product_items (
  id uuid primary key,
  list_id uuid not null references public.product_lists(id),
  done boolean not null default false,
  need_retail text not null default '필요',
  need_wholesale text not null default '필요'
);
create table public.product_registrations (
  item_id uuid not null references public.product_items(id),
  channel text not null check (channel in ('retail', 'wholesale')),
  status text not null check (status in ('pending', 'running', 'success', 'failed')),
  primary key (item_id, channel)
);
alter table public.product_lists enable row level security;
alter table public.product_items enable row level security;
alter table public.product_registrations enable row level security;
revoke all on public.product_lists, public.product_items, public.product_registrations
  from public, anon, authenticated;
grant select, insert, update, delete on public.product_lists, public.product_items, public.product_registrations
  to service_role;
