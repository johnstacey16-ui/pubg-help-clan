'use strict';
const { escapeLike } = require('./pubg-utils');
const {selectSavedConsoleAccount}=require('./saved-console-account');

const WEAPON_LIMIT = 120;
const MATCH_LIMIT = 500;
const asText = value => String(value ?? '').slice(0,100);
const numberOrNull = value => {
  // Missing, negative, boolean, malformed or out-of-range values are unavailable,
  // not silently replaced with a fabricated zero.
  if ((typeof value !== 'number' && typeof value !== 'string') ||
      (typeof value === 'string' && !value.trim())) return null;
  const numeric=Number(value);
  return Number.isFinite(numeric) && numeric>=0 && numeric<=1e10 ? numeric : null;
};
const num = value => numberOrNull(value) ?? 0;
async function read(query) {
  const result=await query;
  if(result.error)throw new Error('Saved console data unavailable');
  return result.data;
}
async function verifiedPlayer(db,submittedName,platform='auto') {
  const name=String(submittedName??'').trim();
  if(!name || name.length>100 || /[,\u0000-\u001f\u007f]/.test(name) ||
      !['auto','xbox','psn'].includes(platform))
    return {status:400,body:{error:'Invalid gamertag'}};
  const people=await read(db.from('players')
    .select('id,gamertag,platform,pubg_account_id')
    .ilike('gamertag',escapeLike(name)).limit(10));
  const resolved=selectSavedConsoleAccount(people,name,platform);
  return resolved.status===404?
    {status:404,body:{error:'Saved console player not found'}}:resolved;
}
function allowStats(input) {
  if(!input || typeof input!=='object')return null;
  const source={
    kills:'Kills',headshots:'HeadShots',damage:'DamagePlayer',
    defeats:'Defeats',knocks:'Groggies',longRangeDefeats:'LongRangeDefeats',
    longestDefeat:'LongestDefeat',longestKill:'LongestKill',
    mostKillsInGame:'MostKillsInAGame',
    mostDefeatsInGame:'MostDefeatsInAGame',
    mostDamageInGame:'MostDamagePlayerInAGame',
    mostHeadshotsInGame:'MostHeadShotsInAGame',
    mostKnocksInGame:'MostGroggiesInAGame'
  };
  const row={};
  for(const [out,key] of Object.entries(source)) {
    const value=numberOrNull(input[key]);
    if(value!==null)row[out]=value;
  }
  return Object.keys(row).length ? row : null;
}
function weaponItems(payload) {
  const entries=payload?.data?.attributes?.weaponSummaries;
  if(!entries || typeof entries!=='object' || Array.isArray(entries))return [];
  return Object.entries(entries).filter(([id,value])=>
    /^Item_Weapon_[A-Za-z0-9_]{1,100}_C$/.test(id) && value && typeof value==='object')
    .map(([id,record])=>{
      const total=allowStats(record.StatsTotal);
      const official=allowStats(record.OfficialStatsTotal);
      const competitive=allowStats(record.CompetitiveStatsTotal);
      return {
        name:asText(id.replace(/^Item_Weapon_/,'').replace(/_C$/,'').replace(/_/g,' ')),
        level:numberOrNull(record.LevelCurrent),tier:numberOrNull(record.TierCurrent),
        xp:numberOrNull(record.XPTotal),
        medals:Array.isArray(record.Medals)?Math.min(record.Medals.length,10000):null,
        total,official,competitive
      };
    }).sort((a,b)=>(b.official?.kills??-1)-(a.official?.kills??-1) ||
      (b.competitive?.kills??-1)-(a.competitive?.kills??-1) ||
      (b.total?.kills??-1)-(a.total?.kills??-1) ||
      (b.xp??-1)-(a.xp??-1) || a.name.localeCompare(b.name)).slice(0,WEAPON_LIMIT);
}
async function weaponInsights(db,player) {
  const cacheKey='pubg:v1:'+player.platform+'/players/'+player.pubg_account_id+'/weapon_mastery';
  const cached=await read(db.from('pubg_endpoint_cache')
    .select('payload,fetched_at').eq('cache_key',cacheKey).maybeSingle());
  const items=weaponItems(cached?.payload);
  return {status:200,body:{
    schemaVersion:1,kind:'weapons',name:player.gamertag,platform:player.platform,
    savedAt:cached?.fetched_at||null,count:items.length,
    note:cached?.payload
      ? 'Real cached PUBG weapon mastery. Official and Competitive count post-18.2 records; legacy StatsTotal stopped updating at patch 18.2. Sources never get added together. Missing fields remain unavailable.'
      : 'No saved weapon mastery yet. Select Refresh mastery from PUBG here, or use /mastery in Discord.',
    items
  }};
}
function survivalFields(payload){
  const attributes=payload?.data?.attributes;
  if(!attributes||typeof attributes!=='object'||Array.isArray(attributes))return null;
  const result={};
  for(const key of ['xp','tier','level','totalMatchesPlayed'])
    result[key]=numberOrNull(attributes[key]);
  return result;
}
async function survivalInsights(db,player){
  const key='pubg:v1:'+player.platform+'/players/'+player.pubg_account_id+'/survival_mastery';
  const entry=await read(db.from('pubg_endpoint_cache')
    .select('payload,fetched_at').eq('cache_key',key).maybeSingle());
  const stats=survivalFields(entry?.payload);
  return{status:200,body:{
    schemaVersion:1,kind:'survival',name:player.gamertag,platform:player.platform,
    savedAt:entry?.fetched_at||null,
    stats,
    note:stats?
      'Genuine PUBG Survival Mastery attributes from the saved account. These statistics are not season-ranked scores; unavailable fields remain missing.':
      'No saved Survival Mastery yet. Use Refresh Survival from PUBG to collect a real response.'
  }};
}
// Compact pair chemistry from original, verified archived squad references.
// A name is a visible PUBG name, not proof of account identity across games.
function teammateChemistry(games,playerName){
  const teammates=new Map(),seen=new Set();
  for(const game of Array.isArray(games)?games:[]){
    if(typeof game?.match_id!=='string'||seen.has(game.match_id))continue;
    seen.add(game.match_id);
    const squad=Array.isArray(game.summary?.squad)?game.summary.squad:[];
    const self=squad.find(p=>p?.isSelf===true);
    const mine=numberOrNull(self?.kills);
    const placement=numberOrNull(game.summary?.placement);
    const time=typeof game.played_at==='string'&&Number.isFinite(Date.parse(game.played_at))
      ?game.played_at:null;
    const map=asText(game.summary?.map||'Unknown map').trim()||'Unknown map';
    const mode=asText(game.summary?.mode||'Unknown mode').trim()||'Unknown mode';
    const names=new Set();
    for(const teammate of squad){
      if(!teammate||teammate.isSelf===true)continue;
      const name=asText(teammate.name||'').trim();
      if(!name||name.toLowerCase()===playerName.toLowerCase())continue;
      const key=name.toLowerCase();
      if(names.has(key))continue;
      names.add(key);
      if(!teammates.has(key))teammates.set(key,{
        name,games:0,knownPlacements:0,wins:0,top10:0,
        kills:0,damage:0,assists:0,knocks:0,
        killsObserved:0,damageObserved:0,assistsObserved:0,knocksObserved:0,
        myKills:0,myKillsObserved:0,pairedKills:0,pairedObserved:0,
        lastPlayedAt:null,maps:new Map(),modes:new Map()
      });
      const item=teammates.get(key);
      item.games++;
      if(placement!==null&&placement>=1){
        item.knownPlacements++;
        if(placement===1)item.wins++;
        if(placement<=10)item.top10++;
      }
      for(const metric of ['kills','damage','assists','knocks']){
        const number=numberOrNull(teammate[metric]);
        if(number!==null){item[metric]+=number;item[metric+'Observed']++;}
      }
      const theirs=numberOrNull(teammate.kills);
      if(mine!==null){
        item.myKills+=mine;item.myKillsObserved++;
        if(theirs!==null){item.pairedKills+=mine+theirs;item.pairedObserved++;}
      }
      if(time&&(!item.lastPlayedAt||time>item.lastPlayedAt))
        item.lastPlayedAt=time;
      item.maps.set(map,(item.maps.get(map)||0)+1);
      item.modes.set(mode,(item.modes.get(mode)||0)+1);
    }
  }
  return{
    archivedMatches:seen.size,
    items:[...teammates.values()].sort((a,b)=>b.games-a.games||
      b.kills-a.kills||a.name.localeCompare(b.name)).slice(0,100).map(p=>({
        name:p.name,games:p.games,knownPlacements:p.knownPlacements,
        wins:p.wins,top10:p.top10,
        winRate:p.knownPlacements?100*p.wins/p.knownPlacements:null,
        top10Rate:p.knownPlacements?100*p.top10/p.knownPlacements:null,
        kills:p.killsObserved?p.kills:null,killsObserved:p.killsObserved,
        damage:p.damageObserved?p.damage:null,damageObserved:p.damageObserved,
        assists:p.assistsObserved?p.assists:null,assistsObserved:p.assistsObserved,
        knocks:p.knocksObserved?p.knocks:null,knocksObserved:p.knocksObserved,
        myKills:p.myKillsObserved?p.myKills:null,myKillsObserved:p.myKillsObserved,
        pairedKills:p.pairedObserved?p.pairedKills:null,pairedObserved:p.pairedObserved,
        pairKillsPerMatch:p.pairedObserved?p.pairedKills/p.pairedObserved:null,
        lastPlayedAt:p.lastPlayedAt,
        maps:[...p.maps].map(([name,games])=>({name,games}))
          .sort((a,b)=>b.games-a.games||a.name.localeCompare(b.name)).slice(0,6),
        modes:[...p.modes].map(([name,games])=>({name,games}))
          .sort((a,b)=>b.games-a.games||a.name.localeCompare(b.name)).slice(0,6)
      }))
  };
}
async function teammateInsights(db,player) {
  const archived=await read(db.from('clan_match_archive')
    .select('match_id,played_at,summary')
    .eq('player_id',player.id).order('played_at',{ascending:false}).limit(MATCH_LIMIT));
  const result=teammateChemistry(archived,player.gamertag);
  return{status:200,body:{
    schemaVersion:1,kind:'teammates',name:player.gamertag,platform:player.platform,
    archivedMatches:result.archivedMatches,count:result.items.length,
    note:'Real saved PUBG squad matches only (up to 500 recent stored records within the 180-day archive). A visible name is not confirmed account identity across games. Placement, partner kills and paired-kill averages use only observed fields, and missing data never counts as zero.',
    items:result.items
  }};
}

async function publicInsights(db,{name,kind,platform='auto'}={}) {
  if(kind!=='weapons'&&kind!=='teammates'&&kind!=='survival')
    return {status:400,body:{error:'Unknown insight type'}};
  const resolved=await verifiedPlayer(db,name,platform);
  if(!resolved.player)return resolved;
  return kind==='weapons'
    ? weaponInsights(db,resolved.player)
    : kind==='survival'?survivalInsights(db,resolved.player)
    : teammateInsights(db,resolved.player);
}
module.exports={publicInsights,weaponItems,allowStats,teammateInsights,teammateChemistry,survivalFields,survivalInsights,verifiedPlayer};
