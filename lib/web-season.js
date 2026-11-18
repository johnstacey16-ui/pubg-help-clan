'use strict';
const {escapeLike}=require('./pubg-utils');
const {selectSavedConsoleAccount}=require('./saved-console-account');
const {MODES,whitelistStats}=require('./web-stats');
const ID=/^[a-zA-Z0-9._-]{4,128}$/;
const asNumber=x=>x===undefined||x===null||!Number.isFinite(Number(x))?null:Math.max(0,Number(x));
const asString=s=>String(s??'').slice(0,100);
async function read(query) {
  const r=await query;
  if(r.error)throw Error('Saved PUBG season data cannot be read');
  return r.data;
}
function shapeRanked(s) {
  if(!s||typeof s!=='object')return null;
  const result={};
  for(const key of ['roundsPlayed','wins','kills','assists','dBNOs','revives',
    'damageDealt','currentRankPoint','bestRankPoint','avgRank','kda','kdr',
    'deaths','top10Ratio','winRatio']){
    const n=asNumber(s[key]);
    if(n!==null)result[key]=n;
  }
  const tier=t=>{
    if(!t||typeof t!=='object')return null;
    return{tier:asString(t.tier||t.name||'Unranked'),subTier:asString(t.subTier||'')};
  };
  if(s.currentTier)result.currentTier=tier(s.currentTier);
  if(s.bestTier)result.bestTier=tier(s.bestTier);
  return result;
}
function shapeSeasonPayload(payload,type) {
  const attr=payload?.data?.attributes;
  const source=type==='ranked'?attr?.rankedGameModeStats:attr?.gameModeStats;
  if(!source||typeof source!=='object'||Array.isArray(source))return[];
  return MODES.filter(mode=>source[mode]&&typeof source[mode]==='object')
    .map(mode=>({mode,stats:type==='ranked'?shapeRanked(source[mode]):whitelistStats(source[mode])}));
}

const safeHistory=(row)=>{
  if(!row||!ID.test(row.season_id||'')||!MODES.includes(row.mode)||
    !['ranked','season'].includes(row.kind)||!row.captured_at||
    !Number.isFinite(Date.parse(row.captured_at)))return null;
  const number=v=>v===undefined||v===null||v===''||!Number.isFinite(Number(v))
    ?null:Math.max(0,Number(v));
  return{
    seasonId:row.season_id,mode:row.mode,capturedAt:row.captured_at,
    matches:number(row.matches),kills:number(row.kills),
    wins:number(row.wins),damage:number(row.damage),
    rankPoints:number(row.rank_points),
    tier:row.tier==null?null:asString(row.tier).slice(0,50),
    subTier:row.sub_tier==null?null:asString(row.sub_tier).slice(0,16)
  };
};

async function savedSeason(db,{name,platform='auto',type='season'}={}) {
  if(!['season','ranked'].includes(type)||!['auto','xbox','psn'].includes(platform)||
      typeof name!=='string'||name.trim()!==name||name.length>100||
      !name||/[,\u0000-\u001f\u007f]/.test(name))
    return{status:400,body:{error:'Invalid console player or season type'}};
  const players=await read(db.from('players')
    .select('id,gamertag,platform,pubg_account_id')
    .ilike('gamertag',escapeLike(name)).limit(10));
  const resolved=selectSavedConsoleAccount(players,name,platform);
  if(resolved.status===404)
    return{status:404,body:{error:'Player not saved. Refresh lifetime data first.'}};
  if(!resolved.player)return resolved;
  const player=resolved.player;
  const prefix='pubg:v1:'+player.platform+'/';
  const seasons=await read(db.from('pubg_endpoint_cache')
    .select('payload,fetched_at').eq('cache_key',prefix+'seasons').maybeSingle());
  const list=Array.isArray(seasons?.payload?.data)?seasons.payload.data:[];
  const active=list.find(s=>s?.attributes?.isCurrentSeason&&!s?.attributes?.isOffseason) ||
    list.find(s=>s?.attributes?.isCurrentSeason);
  const seasonId=ID.test(active?.id||'')?active.id:null;
  let result=null;
  if(seasonId) {
    const key=prefix+'players/'+player.pubg_account_id+'/seasons/'+seasonId+
      (type==='ranked'?'/ranked':'');
    result=await read(db.from('pubg_endpoint_cache')
      .select('payload,fetched_at').eq('cache_key',key).maybeSingle());
  }
  const modes=shapeSeasonPayload(result?.payload,type);
  // Only real response timestamps are persisted. This is a bounded, read-only
  // history query; raw PUBG account IDs and private DB IDs never leave the API.
  const historyRows=await read(db.from('player_season_snapshots')
    .select('season_id,kind,mode,captured_at,matches,kills,wins,damage,rank_points,tier,sub_tier')
    .eq('player_id',player.id).eq('kind',type)
    .order('captured_at',{ascending:false}).limit(240));
  const history=(historyRows||[]).map(r=>safeHistory({...r,kind:type}))
    .filter(Boolean);
  const archivedSeasons=[...new Set(history.map(row=>row.seasonId))];
  if(seasonId&&!archivedSeasons.includes(seasonId))archivedSeasons.unshift(seasonId);
  return{status:200,body:{
    schemaVersion:1,type,name:player.gamertag,platform:player.platform,
    seasonId,savedAt:result?.fetched_at||null,count:modes.length,modes,
    archivedSeasons,historyCount:history.length,history,
    note:!seasonId
      ? 'No saved current-season index. Use Refresh from PUBG to populate it.'
      : !result?.payload
        ? 'Season identified but no saved player statistics. Select Refresh from PUBG.'
        : 'PUBG season statistics saved in Supabase; missing fields are not estimated.'
  }};
}
module.exports={savedSeason,shapeSeasonPayload,shapeRanked,safeHistory};
