-- Applied on 2026-11-12 to PUBG Bot Supabase.
-- Fix PL/pgSQL RETURNS TABLE output name player_id shadowing the PRIMARY KEY
-- in an ON CONFLICT column list (SQLSTATE 42702). No data is modified.
-- Preserve security invoker, service-role-only permission and advisory lock.
create or replace function public.claim_clan_season_sync()
returns table (player_id bigint, gamertag text, platform text, pubg_account_id text)
language plpgsql volatile security invoker set search_path = ''
as $$
declare
  candidate record;
  now_at timestamptz := pg_catalog.clock_timestamp();
begin
  perform pg_catalog.pg_advisory_xact_lock(79301215);
  select p.id, p.gamertag, p.platform, p.pubg_account_id into candidate
    from public.players p
    left join public.clan_season_sync_state state on state.player_id=p.id
   where p.platform in ('xbox','psn')
     and p.pubg_account_id ~ '^[A-Za-z0-9._-]{8,160}$'
     and (state.next_attempt_at is null or state.next_attempt_at <= now_at)
     and exists (
       select 1 from public.player_import_queue q
       where q.is_clan_member=true and q.status='matched'
         and pg_catalog.lower(q.gamertag)=pg_catalog.lower(p.gamertag)
         and (q.platform is null or q.platform=p.platform)
     )
   order by state.last_attempt_at asc nulls first, p.id
   limit 1;
  if not found then return; end if;
  insert into public.clan_season_sync_state
      (player_id,last_attempt_at,next_attempt_at,last_result)
    values (candidate.id,now_at,now_at+interval '23 hours','in_progress')
    on conflict on constraint clan_season_sync_state_pkey do update set
      last_attempt_at=excluded.last_attempt_at,
      next_attempt_at=excluded.next_attempt_at,
      last_result=excluded.last_result;
  return query select candidate.id::bigint,candidate.gamertag::text,
    candidate.platform::text,candidate.pubg_account_id::text;
end;
$$;
revoke all on function public.claim_clan_season_sync()
  from public, anon, authenticated;
grant execute on function public.claim_clan_season_sync() to service_role;
