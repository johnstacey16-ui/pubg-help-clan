-- Additive, append-only evidence for signed Discord Manage Server roster changes.
-- Never expose the service-only mutation to browser, anon or authenticated keys.
create table if not exists public.clan_membership_audit (
  interaction_id text primary key
    check (interaction_id ~ '^[0-9]{16,22}$'),
  actor_discord_id text not null
    check (actor_discord_id ~ '^[0-9]{16,22}$'),
  guild_id text not null
    check (guild_id = '1411949587299569788'),
  gamertag text not null
    check (length(gamertag) between 1 and 100),
  action text not null
    check (action in ('add', 'remove')),
  previous_membership boolean not null,
  current_membership boolean not null,
  observed_status text not null,
  occurred_at timestamptz not null default now()
);
alter table public.clan_membership_audit enable row level security;
revoke all on table public.clan_membership_audit from public, anon, authenticated;
grant select, insert on table public.clan_membership_audit to service_role;

-- Call only from a Discord Ed25519-verified interaction with Manage Server
-- (or Administrator) permissions. SECURITY INVOKER makes service-role grants
-- and RLS the governing authority; anon/authenticated cannot execute this RPC.
-- Advisory lock serialises same-name mutations and Discord retry deliveries.
create or replace function public.manage_discord_clan_membership(
  p_interaction_id text,
  p_actor_discord_id text,
  p_guild_id text,
  p_gamertag text,
  p_action text
)
returns jsonb
language plpgsql
security invoker
set search_path to ''
as $fn$
declare
  existing public.player_import_queue%rowtype;
  duplicate_event public.clan_membership_audit%rowtype;
  matches integer;
  previous boolean := false;
  desired boolean;
  outcome text;
begin
  if p_guild_id is distinct from '1411949587299569788'
    or p_interaction_id is null or p_interaction_id !~ '^[0-9]{16,22}$'
    or p_actor_discord_id is null or p_actor_discord_id !~ '^[0-9]{16,22}$'
    or p_action not in ('add','remove') or p_action is null
    or p_gamertag is null
    or p_gamertag <> pg_catalog.btrim(p_gamertag)
    or pg_catalog.length(p_gamertag) not between 1 and 100
    or p_gamertag !~ '^[^,[:cntrl:]]+$'
  then return pg_catalog.jsonb_build_object('status','invalid'); end if;

  perform pg_catalog.pg_advisory_xact_lock(
    17072026,pg_catalog.hashtext(pg_catalog.lower(p_gamertag)));

  select * into duplicate_event from public.clan_membership_audit
  where interaction_id = p_interaction_id;
  if found then
    return pg_catalog.jsonb_build_object(
      'status','duplicate',
      'gamertag',duplicate_event.gamertag,
      'action',duplicate_event.action,
      'isClanMember',duplicate_event.current_membership);
  end if;

  -- Existing queue is unique by exact-case gamertag. Do not silently pick a
  -- platform or a record when case-insensitive names are ambiguous.
  select pg_catalog.count(*) into matches
  from public.player_import_queue
  where pg_catalog.lower(gamertag) = pg_catalog.lower(p_gamertag);
  if matches > 1 then
    return pg_catalog.jsonb_build_object('status','ambiguous');
  end if;

  select * into existing from public.player_import_queue
  where pg_catalog.lower(gamertag) = pg_catalog.lower(p_gamertag)
  order by id limit 1 for update;

  desired := p_action='add';
  if existing.id is null then
    if not desired then
      return pg_catalog.jsonb_build_object('status','not_found');
    end if;
    -- A new manager-approved clan name is UNVERIFIED until the existing
    -- Xbox+PSN importer proves one unique official PUBG account.
    insert into public.player_import_queue (
      gamertag,status,platform,pubg_account_id,is_clan_member,note
    ) values (
      p_gamertag,'pending',null,null,true,
      'Clan manager added; awaiting PUBG console identity verification'
    ) returning * into existing;
  else
    previous := existing.is_clan_member;
    if previous=desired then
      return pg_catalog.jsonb_build_object(
        'status','unchanged','gamertag',existing.gamertag,
        'isClanMember',previous,'verification',existing.status,
        'platform',existing.platform);
    end if;
    -- Never delete the tracked account, lifetime statistics, verification
    -- status, account ID or user-submitted profile to remove clan access.
    update public.player_import_queue set is_clan_member=desired
    where id=existing.id returning * into existing;
  end if;

  insert into public.clan_membership_audit(
    interaction_id,actor_discord_id,guild_id,gamertag,action,
    previous_membership,current_membership,observed_status
  ) values (
    p_interaction_id,p_actor_discord_id,p_guild_id,existing.gamertag,
    p_action,previous,desired,existing.status
  );
  outcome := case when desired then 'added' else 'removed' end;
  return pg_catalog.jsonb_build_object(
    'status',outcome,'gamertag',existing.gamertag,
    'isClanMember',desired,'verification',existing.status,
    'platform',existing.platform,'needsPubgVerification',
    existing.status <> 'matched');
end;
$fn$;

revoke all on function public.manage_discord_clan_membership(
 text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.manage_discord_clan_membership(
 text,text,text,text,text) to service_role;
