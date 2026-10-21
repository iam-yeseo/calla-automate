-- Worker-only list summaries. Apply before deploying the matching Worker.
begin;
create or replace function public.product_list_summaries()
returns jsonb language sql stable security invoker set search_path = '' as $$
  with item_totals as (
    select list_id, count(*) as total,
      count(*) filter (where done) as done_count,
      count(*) filter (where need_retail = '필요') as retail_total,
      count(*) filter (where need_wholesale = '필요') as wholesale_total
    from public.product_items group by list_id
  ), registration_totals as (
    select i.list_id,
      count(*) filter (where r.status = 'success' and r.channel = 'retail' and i.need_retail = '필요') as retail_success,
      count(*) filter (where r.status = 'success' and r.channel = 'wholesale' and i.need_wholesale = '필요') as wholesale_success,
      count(*) filter (where r.status = 'running') as running_count,
      count(*) filter (where r.status = 'failed') as failed_count
    from public.product_registrations r
    join public.product_items i on i.id = r.item_id
    group by i.list_id
  )
  -- A scalar JSON array avoids PostgREST's row cap without client-side paging.
  select coalesce(jsonb_agg(to_jsonb(l) || jsonb_build_object(
    'total', coalesce(i.total, 0), 'doneCount', coalesce(i.done_count, 0),
    'retailSuccess', coalesce(r.retail_success, 0), 'wholesaleSuccess', coalesce(r.wholesale_success, 0),
    'retailTotal', coalesce(i.retail_total, 0), 'wholesaleTotal', coalesce(i.wholesale_total, 0),
    'runningCount', coalesce(r.running_count, 0), 'failedCount', coalesce(r.failed_count, 0)
  ) order by l.created_at desc), '[]'::jsonb)
  from public.product_lists l
  left join item_totals i on i.list_id = l.id
  left join registration_totals r on r.list_id = l.id;
$$;
revoke all on function public.product_list_summaries() from public, anon, authenticated;
grant execute on function public.product_list_summaries() to service_role;
commit;
