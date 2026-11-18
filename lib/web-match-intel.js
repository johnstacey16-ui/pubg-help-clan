'use strict';
const { escapeLike } = require('./pubg-utils');
const {selectSavedConsoleAccount}=require('./saved-console-account');

// This is a cache-only public view. Neither this file nor its API handler
// makes a PUBG request or calls the shared rate-budget RPC.
const INDEX_LIMIT = 8;
const ARCHIVE_LIMIT = 100; // Most recent saved player reports, bounded for free-tier responses.
const MATCH_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const asText = value => String(value == null ? '' : value).slice(0,100);
const asNum = value => {
  // Absent, malformed and negative numbers are unavailable, not fabricated zero.
  if((typeof value!=='number' && typeof value!=='string') ||
      (typeof value==='string' && !value.trim()))return null;
  const n=Number(value);
  return Number.isFinite(n)&&n>=0&&n<=1e8?n:null;
};
const deathType = value => ['alive','byplayer','byzone','suicide','logout']
  .includes(value) ? value : null;
async function read(query) {
  const result = await query;
  if (result.error) throw new Error('Saved match data temporarily unavailable');
  return result.data;
}
function summarizeMatch(payload, accountId) {
  const root = payload?.data;
  const attr = root?.attributes || {};
  const included = Array.isArray(payload?.included) ? payload.included : [];
  if (!root || typeof root.id !== 'string') return null;
  const participants = included.filter(p => p.type === 'participant');
  const found = participants.find(p => p.attributes?.stats?.playerId === accountId);
  if (!found) return null;
  const s = found.attributes?.stats || {};
  const roster = included.find(r => r.type === 'roster' &&
    Array.isArray(r.relationships?.participants?.data) &&
    r.relationships.participants.data.some(p => p.id === found.id));
  const memberIds = new Set(roster?.relationships?.participants?.data?.map(x => x.id) || []);
  const teammates = participants.filter(p => memberIds.has(p.id)).map(p => {
    const t = p.attributes?.stats || {};
    return {
      name: asText(t.name), isSelf: p.id === found.id,
      kills: asNum(t.kills), damage: asNum(t.damageDealt),
      assists: asNum(t.assists), knocks: asNum(t.DBNOs),
      headshots: asNum(t.headshotKills), revives: asNum(t.revives),
      timeSurvivedSeconds: asNum(t.timeSurvived), deathType: deathType(t.deathType)
    };
  });
  const team = teammates.length ? teammates : [{
    name:asText(s.name), isSelf:true, kills:asNum(s.kills),
    damage:asNum(s.damageDealt), assists:asNum(s.assists), knocks:asNum(s.DBNOs),
    headshots:asNum(s.headshotKills), revives:asNum(s.revives),
    timeSurvivedSeconds:asNum(s.timeSurvived), deathType:deathType(s.deathType)
  }];
  return {
    id: root.id,
    map: asText(attr.mapName || 'Unknown map'),
    mode: asText(attr.gameMode || 'Unknown mode'),
    playedAt: typeof attr.createdAt === 'string' ? attr.createdAt : null,
    durationSeconds: asNum(attr.duration),
    placement: Number(s.winPlace)>0 ? Number(s.winPlace) : null,
    kills: asNum(s.kills), damage: asNum(s.damageDealt),
    assists: asNum(s.assists), knocks: asNum(s.DBNOs),
    headshots: asNum(s.headshotKills), revives: asNum(s.revives),
    heals: asNum(s.heals), boosts: asNum(s.boosts),
    longestKillMeters: asNum(s.longestKill),
    walkMeters: asNum(s.walkDistance), driveMeters: asNum(s.rideDistance),
    swimMeters: asNum(s.swimDistance),
    timeSurvivedSeconds: asNum(s.timeSurvived),
    killPlace: asNum(s.killPlace), killStreaks: asNum(s.killStreaks),
    roadKills: asNum(s.roadKills), teamKills: asNum(s.teamKills),
    vehicleDestroys: asNum(s.vehicleDestroys),
    weaponsAcquired: asNum(s.weaponsAcquired),
    deathType: deathType(s.deathType),
    squad: team.slice(0,8)
  };
}

function safeArchivedSummary(row) {
  const s=row?.summary || {};
  if(typeof row?.match_id!=='string'||!MATCH_ID.test(row.match_id))return null;
  if(!row.played_at||typeof s!=='object'||s.id!==row.match_id)return null;
  const safe={id:row.match_id,map:asText(s.map||'Unknown map'),
    mode:asText(s.mode||'Unknown mode'),playedAt:row.played_at,
    placement:asNum(s.placement)>0?Math.trunc(asNum(s.placement)):null,
    savedAt:row.recorded_at||null,archived:true,
    deathType:deathType(s.deathType)};
  for(const k of ['durationSeconds','kills','damage','assists','knocks','headshots',
      'revives','heals','boosts','longestKillMeters','walkMeters','driveMeters',
      'swimMeters','timeSurvivedSeconds','killPlace','killStreaks',
      'roadKills','teamKills','vehicleDestroys','weaponsAcquired'])
    safe[k]=asNum(s[k]);
  safe.squad=(Array.isArray(s.squad)?s.squad:[]).slice(0,8).map(t=>({
    name:asText(t.name),isSelf:t.isSelf===true,kills:asNum(t.kills),
    damage:asNum(t.damage),assists:asNum(t.assists),knocks:asNum(t.knocks),
    headshots:asNum(t.headshots),revives:asNum(t.revives),
    timeSurvivedSeconds:asNum(t.timeSurvivedSeconds),
    deathType:deathType(t.deathType)
  }));
  return safe;
}
async function cachedPlayerMatches(db, suppliedName, platform='auto') {
  const name=String(suppliedName||'').trim();
  if (!name || name.length>100 || /[,\u0000-\u001f\u007f]/.test(name) ||
      !['auto','xbox','psn'].includes(platform))
    return { status:400, body:{error:'Invalid PUBG gamertag'} };
  const players=await read(db.from('players')
    .select('id,gamertag,platform,pubg_account_id')
    .ilike('gamertag',escapeLike(name)).limit(10));
  const resolved=selectSavedConsoleAccount(players,name,platform);
  if(resolved.status===404)return{status:404,body:{error:'Saved console player not found'}};
  if(!resolved.player)return resolved;
  const player=resolved.player;
  // Read this service-role-only cache only for a saved, resolved console player.
  const archived=await read(db.from('clan_match_archive')
    .select('match_id,played_at,summary,recorded_at')
    .eq('player_id',player.id).order('played_at',{ascending:false})
    .limit(ARCHIVE_LIMIT));
  const saved=(archived||[]).map(safeArchivedSummary).filter(Boolean);
  if(saved.length)return{status:200,body:{
    schemaVersion:1,name:player.gamertag,platform:player.platform,
    indexSavedAt:null,indexedCount:saved.length,availableCount:saved.length,
    archivedCount:saved.length,source:'Private 180-day archive, no live PUBG requests',
    note:'Previously retrieved matches are retained for up to 180 days, beyond the temporary PUBG cache.',
    matches:saved
  }};
  const key='pubg:v1:'+player.platform+'/players/'+player.pubg_account_id;
  const index=await read(db.from('pubg_endpoint_cache')
    .select('payload,fetched_at').eq('cache_key',key).maybeSingle());
  const requested=(index?.payload?.data?.relationships?.matches?.data||[]);
  const ids=[...new Set(Array.isArray(requested)?requested.map(x=>x.id)
    .filter(x=>typeof x==='string'&&MATCH_ID.test(x)):[])].slice(0,INDEX_LIMIT);
  let items=[];
  if(ids.length) {
    const rows=await read(db.from('pubg_endpoint_cache')
      .select('cache_key,payload,fetched_at')
      .in('cache_key',ids.map(id=>'pubg:v1:console/matches/'+id)).limit(INDEX_LIMIT));
    const byKey=new Map((rows||[]).map(row=>[row.cache_key,row]));
    items=ids.map(id=>{
      const row=byKey.get('pubg:v1:console/matches/'+id);
      const summary=row&&summarizeMatch(row.payload,player.pubg_account_id);
      return summary && summary.id===id
        ? {...summary,savedAt:row.fetched_at||null} : null;
    }).filter(Boolean);
  }
  return {status:200,body:{
    schemaVersion:1,name:player.gamertag,platform:player.platform,
    indexSavedAt:index?.fetched_at||null,
    indexedCount:ids.length,availableCount:items.length,archivedCount:0,
    source:'Saved PUBG match cache; no live PUBG requests',
    note:index?.payload
      ? 'Only matches previously retrieved by the Discord bot appear. Match records are normally available from PUBG for about 14 days.'
      : 'No saved recent-match index yet. Select Refresh recent from PUBG here, or use /recent in Discord.',
    matches:items
  }};
}
module.exports={cachedPlayerMatches,summarizeMatch,safeArchivedSummary,INDEX_LIMIT,ARCHIVE_LIMIT};
