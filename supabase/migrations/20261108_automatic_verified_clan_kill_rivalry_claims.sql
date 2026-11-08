-- Automatically collect real directed player kills for currently verified
-- Xbox/PSN clan members from full PUBG matches already saved in private cache.
-- Reuses the existing service-only web_refresh_guard table as an atomic lease
-- and completion marker. No table, new cron, API key or public endpoint.
create or replace function public.claim_clan_kill_rivalry_matches(p_limit integer default 2)
returns table(match_id text, lease_at timestamptz)
language plpgsql
security invoker
set search_path to ''
as $function$
declare
  moment timestamptz := clock_timestamp();
  candidate record;
  claim_time timestamptz;
begin
  if p_limit is null or p_limit < 1 or p_limit > 2 then
    raise exception 'Invalid bounded rivalry claim size';
  end if;
  -- Serialise only this background collector. Do not block the PUBG key budget.
  perform pg_catalog.pg_advisory_xact_lock(87119529);
  for candidate in
    select c.payload #>> '{data,id}' as id
    from public.pubg_endpoint_cache c
    where c.cache_key like 'pubg:v1:console/matches/%'
      and c.cache_key='pubg:v1:console/matches/' ||
        coalesce(c.payload #>> '{data,id}','')
      and (c.payload #>> '{data,id}') ~*
        '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
      and c.fetched_at > moment - interval '16 days'
      and jsonb_typeof(c.payload->'included')='array'
      and exists (
        select 1
        from jsonb_array_elements(
          case when jsonb_typeof(c.payload->'included')='array'
            then c.payload->'included' else '[]'::jsonb end
        ) part
        join public.player_import_queue q
          on q.pubg_account_id=part.value #>> '{attributes,stats,playerId}'
        where part.value->>'type'='participant'
          and q.is_clan_member=true and q.status='matched'
          and q.platform in ('xbox','psn')
      )
      and not exists (
        select 1 from public.web_refresh_guard guard
        where guard.scope='kill-rivalry:match:' || (c.payload #>> '{data,id}')
          and guard.next_allowed>moment
      )
    order by c.fetched_at desc,c.cache_key
    limit p_limit
  loop
    claim_time:=clock_timestamp();
    insert into public.web_refresh_guard(scope,next_allowed,updated_at)
      values('kill-rivalry:match:'||candidate.id,
        claim_time+interval '2 minutes',claim_time)
    on conflict(scope) do update set
      next_allowed=excluded.next_allowed,updated_at=excluded.updated_at
    where public.web_refresh_guard.next_allowed<=moment;
    if found then
      match_id:=candidate.id;
      lease_at:=claim_time;
      return next;
    end if;
  end loop;
end
$function$;
revoke all on function public.claim_clan_kill_rivalry_matches(integer)
  from public,anon,authenticated;
grant execute on function public.claim_clan_kill_rivalry_matches(integer)
  to service_role;
