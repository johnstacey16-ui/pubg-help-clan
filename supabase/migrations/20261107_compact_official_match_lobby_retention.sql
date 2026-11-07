-- Durable compact official PUBG match lobbies, for up to 180 days.
-- Separate from the short-lived raw match endpoint cache and from per-player
-- compact match summaries. This stores only explicitly allowlisted official
-- participant/roster fields; never telemetry asset URLs, chat, tokens or
-- arbitrary vendor extensions. Participant account IDs remain private for
-- verification; the API response strips them via the source-safe JS shaper.
create table if not exists public.pubg_match_lobby_archive (
 match_id text primary key
   check (match_id ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'),
 played_at timestamptz not null,
 source_fetched_at timestamptz not null,
 compact_match jsonb not null,
 archived_at timestamptz not null default now(),
 constraint compact_lobby_record check (
   jsonb_typeof(compact_match) = 'object' and
   jsonb_typeof(compact_match->'included') = 'array'
 )
);
create index if not exists pubg_match_lobby_archive_age_idx
 on public.pubg_match_lobby_archive (played_at);
alter table public.pubg_match_lobby_archive enable row level security;
revoke all on table public.pubg_match_lobby_archive from public,anon,authenticated;
grant select,insert,update,delete on table public.pubg_match_lobby_archive to service_role;

-- SECURITY INVOKER: exclusively the service role may read tracked identities,
-- save the private record, or call the function via PostgREST.
create or replace function public.archive_saved_pubg_match_lobby(
 p_payload jsonb, p_fetched_at timestamptz
) returns integer
language plpgsql
security invoker
set search_path to ''
as $fn$
declare
 match_value text;
 included jsonb;
 attrs jsonb;
 played timestamptz;
 participants jsonb;
 rosters jsonb;
 sanitized jsonb;
begin
 match_value := p_payload #>> '{data,id}';
 attrs := p_payload #> '{data,attributes}';
 included := p_payload -> 'included';
 if match_value is null
    or match_value !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    or jsonb_typeof(attrs) <> 'object'
    or jsonb_typeof(included) <> 'array'
    or p_fetched_at is null
 then return 0; end if;
 begin
   played := (attrs->>'createdAt')::timestamptz;
 exception when others then
   return 0;
 end;
 if played is null or played < now()-interval '180 days'
   or played > now()+interval '1 day' then return 0; end if;

 -- Only archive a lobby in which at least one already saved, legitimate
 -- Xbox/PlayStation player participates. An arbitrary non-clan enemy match
 -- does not become a public or stored searchable leaderboard.
 if not exists (
  select 1 from jsonb_array_elements(included) item
  join public.players p on p.pubg_account_id =
    item.value #>> '{attributes,stats,playerId}'
  where item.value->>'type'='participant'
    and p.platform in ('xbox','psn')
 ) then return 0; end if;

 -- Whitelist fields by rebuilding them: never save raw external JSON.
 select coalesce(jsonb_agg(jsonb_build_object(
  'type','participant','id',part.value->>'id',
  'attributes',jsonb_build_object('stats',jsonb_build_object(
    'playerId',part.value #>> '{attributes,stats,playerId}',
    'name',part.value #>> '{attributes,stats,name}',
    'winPlace',part.value #> '{attributes,stats,winPlace}',
    'killPlace',part.value #> '{attributes,stats,killPlace}',
    'kills',part.value #> '{attributes,stats,kills}',
    'damageDealt',part.value #> '{attributes,stats,damageDealt}',
    'DBNOs',part.value #> '{attributes,stats,DBNOs}',
    'assists',part.value #> '{attributes,stats,assists}',
    'headshotKills',part.value #> '{attributes,stats,headshotKills}',
    'revives',part.value #> '{attributes,stats,revives}',
    'heals',part.value #> '{attributes,stats,heals}',
    'boosts',part.value #> '{attributes,stats,boosts}',
    'killStreaks',part.value #> '{attributes,stats,killStreaks}',
    'longestKill',part.value #> '{attributes,stats,longestKill}',
    'roadKills',part.value #> '{attributes,stats,roadKills}',
    'teamKills',part.value #> '{attributes,stats,teamKills}',
    'vehicleDestroys',part.value #> '{attributes,stats,vehicleDestroys}',
    'timeSurvived',part.value #> '{attributes,stats,timeSurvived}',
    'walkDistance',part.value #> '{attributes,stats,walkDistance}',
    'rideDistance',part.value #> '{attributes,stats,rideDistance}',
    'swimDistance',part.value #> '{attributes,stats,swimDistance}',
    'weaponsAcquired',part.value #> '{attributes,stats,weaponsAcquired}',
    'deathType',part.value #>> '{attributes,stats,deathType}'
  ))
 ) order by part.ordinality),'[]'::jsonb) into participants
 from (
  select item.value,item.ordinality
  from jsonb_array_elements(included) with ordinality item(value,ordinality)
  where item.value->>'type'='participant' and
    nullif(item.value->>'id','') is not null
  order by item.ordinality limit 150
 ) part;
 if jsonb_array_length(participants)=0 then return 0; end if;

 select coalesce(jsonb_agg(jsonb_build_object(
  'type','roster','id',r.value->>'id',
  'attributes',jsonb_build_object('stats',jsonb_build_object(
    'rank',r.value #> '{attributes,stats,rank}'
  )),
  'relationships',jsonb_build_object('participants',jsonb_build_object(
    'data',case when jsonb_typeof(r.value #> '{relationships,participants,data}')='array'
      then coalesce((
        select jsonb_agg(jsonb_build_object('id',ref.value->>'id') order by ref.ordinality)
        from (
          select item.value,item.ordinality from
          jsonb_array_elements(r.value #> '{relationships,participants,data}')
          with ordinality item(value,ordinality)
          where nullif(item.value->>'id','') is not null
          order by item.ordinality limit 8
        ) ref
      ),'[]'::jsonb)
      else '[]'::jsonb end
  ))
 ) order by r.ordinality),'[]'::jsonb) into rosters
 from (
  select item.value,item.ordinality
  from jsonb_array_elements(included) with ordinality item(value,ordinality)
  where item.value->>'type'='roster'
  order by item.ordinality limit 150
 ) r;

 sanitized:=jsonb_build_object(
  'data',jsonb_build_object(
    'id',match_value,'attributes',jsonb_build_object(
      'mapName',attrs->>'mapName',
      'gameMode',attrs->>'gameMode',
      'matchType',attrs->>'matchType',
      'createdAt',attrs->>'createdAt',
      'duration',attrs->'duration'
    )
  ),'included',participants||rosters
 );
 -- Compact retention only; oversized malformed matches never consume quota.
 if pg_catalog.pg_column_size(sanitized) > 120000 then return 0; end if;
 insert into public.pubg_match_lobby_archive (
  match_id,played_at,source_fetched_at,compact_match
 ) values (pg_catalog.lower(match_value),played,p_fetched_at,sanitized)
 on conflict (match_id) do update set
  played_at=excluded.played_at,
  source_fetched_at=excluded.source_fetched_at,
  compact_match=excluded.compact_match,
  archived_at=now()
 where excluded.source_fetched_at >=
   public.pubg_match_lobby_archive.source_fetched_at;
 return 1;
exception when others then
 raise warning 'Compact PUBG match lobby archive skipped: %',SQLERRM;
 return 0;
end
$fn$;

revoke all on function public.archive_saved_pubg_match_lobby(jsonb,timestamptz)
 from public,anon,authenticated;
grant execute on function public.archive_saved_pubg_match_lobby(jsonb,timestamptz)
 to service_role;

-- Hook into the EXISTING saved-response trigger; keep its personal match
-- summary archiving intact. Both work automatically on each saved match.
create or replace function public.capture_pubg_cached_match()
returns trigger
language plpgsql
security invoker
set search_path to ''
as $fn$
begin
 if new.cache_key like 'pubg:v1:console/matches/%' and
    new.cache_key = 'pubg:v1:console/matches/' ||
      coalesce(new.payload #>> '{data,id}','')
 then
   perform public.archive_verified_clan_match(new.payload);
   perform public.archive_saved_pubg_match_lobby(new.payload,new.fetched_at);
 end if;
 return new;
end
$fn$;

-- Existing cron runs once daily; prune on the same authenticated cycle.
create or replace function public.prune_pubg_match_lobby_archive()
returns integer
language plpgsql
security invoker
set search_path to ''
as $fn$
declare removed integer;
begin
 delete from public.pubg_match_lobby_archive
 where played_at<now()-interval '180 days';
 get diagnostics removed=row_count;
 return removed;
end
$fn$;
revoke all on function public.prune_pubg_match_lobby_archive()
 from public,anon,authenticated;
grant execute on function public.prune_pubg_match_lobby_archive()
 to service_role;

-- Backfill in bounded batches after migration deployment from existing cache.
-- Do not call PUBG and do not rewrite its original saved source rows.
