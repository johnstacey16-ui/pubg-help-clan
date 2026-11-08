'use strict';
// Source-verified official PUBG lobby scouting, with NO telemetry, replay,
// position tracking, extra PUBG budget, or identity claims from visible names.
const {escapeLike}=require('./pubg-utils');
const {shapeLobby}=require('./web-match-lobby');
const MATCH_ID=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const ACCOUNT=/^[a-zA-Z0-9._-]{8,160}$/;
const DAYS=new Set([7,30,180]);
const ORDERS=new Set(['matches','kills','damage','knocks','assists','headshots','latest']);
const MAX_MATCHES=75,MAX_NAMES=80,MAX_DETAIL=25;
const PROFILE_FIELDS=Object.freeze([
 'knocks','assists','headshots','revives','heals','boosts',
 'longestKillMeters','timeSurvivedSeconds','walkMeters','driveMeters',
 'roadKills','vehicleDestroys','weaponsAcquired'
]);
function emptyProfile(){
 return Object.fromEntries(PROFILE_FIELDS.map(key=>[key,{total:0,observed:0,max:null}]));
}
function addProfile(profile,player){
 for(const key of PROFILE_FIELDS){
  const value=number(player[key]);
  if(value===null)continue;
  profile[key].total+=value;
  profile[key].observed++;
  profile[key].max=profile[key].max===null?value:Math.max(profile[key].max,value);
 }
}
function validName(v){
 return typeof v==='string'&&v===v.trim()&&v.length>0&&v.length<=100&&
  !/[,\u0000-\u001f\u007f]/.test(v);
}
function visibleName(v){
 return typeof v==='string'&&v.trim()&&v.length<=100&&
  !/^(account[._-]|unnamed participant$|unknown$)/i.test(v)?v.trim():null;
}
function filterValue(v){
 return v===undefined||v===''?'':typeof v==='string'&&v.length<=90&&
  /^[a-zA-Z0-9._ -]+$/.test(v)?v:null;
}
function parseFilters({days,map,mode,sort,opponent}={}){
 const windowDays=days===undefined||days===''?30:
  typeof days==='string'&&/^(7|30|180)$/.test(days)?Number(days):
  typeof days==='number'&&DAYS.has(days)?days:null;
 const sortOrder=sort===undefined||sort===''?'matches':sort;
 const mapName=filterValue(map),modeName=filterValue(mode);
 if(!windowDays||mapName===null||modeName===null||!ORDERS.has(sortOrder)||
   (opponent!==undefined&&opponent!==null&&!validName(opponent)))return null;
 return{days:windowDays,map:mapName,mode:modeName,sort:sortOrder,
  opponent:opponent||null};
}
const number=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1e8?n:null;
const stamp=s=>typeof s==='string'&&Number.isFinite(Date.parse(s))?
 new Date(s).toISOString():null;
function summarizeLobbies(rows,accountId,options={},now=Date.now()){
 const filters=parseFilters(options);
 if(!filters||!ACCOUNT.test(String(accountId||'')))return null;
 const cutoff=now-filters.days*86400_000;
 const names=new Map(),maps=new Set(),modes=new Set();
 let usable=0,classified=0,matching=0,opponentSlots=0,matchedFromArchive=0;
 const seenIds=new Set();
 for(const row of (Array.isArray(rows)?rows:[]).slice(0,MAX_MATCHES)){
  const id=String(row?.match_id||'').toLowerCase();
  const played=stamp(row?.played_at),source=stamp(row?.source_fetched_at);
  if(!MATCH_ID.test(id)||seenIds.has(id)||!played||
    Date.parse(played)<cutoff||Date.parse(played)>now+86400_000)continue;
  seenIds.add(id);
  const lobby=shapeLobby(row.compact_match,accountId,id,source);
  if(!lobby)continue;
  usable++;
  if(row?.archived_at)matchedFromArchive++;
  const own=lobby.teams.find(t=>t.isOwnTeam&&t.assignedRoster);
  // An unassigned player or missing roster cannot establish opponents.
  if(!own)continue;
  classified++;
  if(lobby.map!=='Unknown map')maps.add(lobby.map);
  if(lobby.mode!=='Unknown mode')modes.add(lobby.mode);
  if(filters.map&&lobby.map!==filters.map)continue;
  if(filters.mode&&lobby.mode!==filters.mode)continue;
  matching++;
  for(const team of lobby.teams){
   if(team.isOwnTeam||!team.assignedRoster)continue;
   for(const p of team.players){
    const label=visibleName(p.name);
    if(!label||p.isSelf)continue;
    opponentSlots++;
    const key=label.toLocaleLowerCase('en-US');
    if(!names.has(key))names.set(key,{
     name:label,matches:new Set(),appearances:0,kills:0,killsObserved:0,
     damage:0,damageObserved:0,placementsObserved:0,bestPlacement:null,
     lastMatchAt:null,nameCollisions:0,profile:emptyProfile(),observations:[],seenThisMatch:new Map()
    });
    const g=names.get(key);
    const previous=g.seenThisMatch.get(id)||0;
    if(previous===1)g.nameCollisions++;
    g.seenThisMatch.set(id,previous+1);
    g.matches.add(id);g.appearances++;
    addProfile(g.profile,p);
    if(number(p.kills)!==null){g.kills+=p.kills;g.killsObserved++;}
    if(number(p.damage)!==null){g.damage+=p.damage;g.damageObserved++;}
    if(number(p.placement)!==null&&p.placement>0){
     g.bestPlacement=g.bestPlacement===null?p.placement:
      Math.min(g.bestPlacement,p.placement);
     g.placementsObserved++;
    }
    if(!g.lastMatchAt||Date.parse(played)>Date.parse(g.lastMatchAt))
     g.lastMatchAt=played;
    g.observations.push({
     matchId:id,playedAt:played,map:lobby.map,mode:lobby.mode,
     opponentKills:number(p.kills),opponentDamage:number(p.damage),
     opponentPlacement:number(p.placement),
     playerKills:number(own.players.find(x=>x.isSelf)?.kills),
     playerDamage:number(own.players.find(x=>x.isSelf)?.damage),
     playerPlacement:number(own.placement),
     profile:Object.fromEntries(PROFILE_FIELDS.map(key=>[key,number(p[key])]))
    });
   }
  }
 }
 const list=[...names.values()].map(g=>({
  name:g.name,matchesObserved:g.matches.size,participantAppearances:g.appearances,
  kills:g.killsObserved?g.kills:null,killsObserved:g.killsObserved,
  damage:g.damageObserved?g.damage:null,damageObserved:g.damageObserved,
  bestPlacement:g.bestPlacement,placementsObserved:g.placementsObserved,
  latestMatchAt:g.lastMatchAt,nameCollisionMatches:g.nameCollisions,
  profile:g.profile,
  observations:g.observations
 }));
 list.sort((a,b)=>{
  const left=v=>v===null?-1:v;
  if(['knocks','assists','headshots'].includes(filters.sort)){
   const metric=filters.sort;
   const score=x=>x.profile[metric].observed?x.profile[metric].total:-1;
   return score(b)-score(a)||b.matchesObserved-a.matchesObserved||
    a.name.localeCompare(b.name);
  }
  if(filters.sort==='kills')return left(b.kills)-left(a.kills)||
    b.matchesObserved-a.matchesObserved||a.name.localeCompare(b.name);
  if(filters.sort==='damage')return left(b.damage)-left(a.damage)||
    b.matchesObserved-a.matchesObserved||a.name.localeCompare(b.name);
  if(filters.sort==='latest')return (Date.parse(b.latestMatchAt)||0)-
    (Date.parse(a.latestMatchAt)||0)||b.matchesObserved-a.matchesObserved||
    a.name.localeCompare(b.name);
  return b.matchesObserved-a.matchesObserved||b.participantAppearances-a.participantAppearances||
   a.name.localeCompare(b.name);
 });
 const summary={
  schemaVersion:1,kind:'lobby-opponent-scout',windowDays:filters.days,
  filterMap:filters.map,filterMode:filters.mode,sort:filters.sort,
  lobbyReportsVerified:usable,lobbyReportsClassified:classified,
  matchesIncluded:matching,opponentAppearances:opponentSlots,
  opponentNames:list.length,opponentsReturned:Math.min(list.length,MAX_NAMES),
  mapOptions:[...maps].sort(),modeOptions:[...modes].sort(),
  note:'Official saved PUBG full-lobby participant stats only. Opponents are participants assigned to a different verified roster in the same recorded match; missing rosters are excluded. Matching visible names across matches do NOT establish the same PUBG account. Kills, damage and placement are each opponent’s match totals, NOT kills or damage against the selected player. Additional recorded combat and movement statistics carry their own observed sample counts; absent stats are unavailable, not zero. Only the latest 75 saved match references and up to 80 visible opponent name groups are included. No telemetry, replays, coordinates or new PUBG requests.'
 };
 if(filters.opponent){
  const g=list.find(x=>x.name.toLowerCase()===filters.opponent.toLowerCase());
  const events=g?g.observations.slice().sort((a,b)=>Date.parse(b.playedAt)-Date.parse(a.playedAt))
   .slice(0,MAX_DETAIL):[];
  return{...summary,kind:'lobby-opponent-detail',opponent:filters.opponent,
   observationsAvailable:g?.observations.length||0,
   observationsReturned:events.length,profile:g?.profile||emptyProfile(),
   observations:events};
 }
 return{...summary,opponents:list.slice(0,MAX_NAMES).map(({observations,...other})=>other)};
}
async function read(query){
 const result=await query;
 if(result.error)throw Error('Saved lobby scouting records unavailable');
 return result.data;
}
async function publicLobbyOpponents(db,{name,...raw}={},services={}){
 if(!validName(name))return{status:400,body:{error:'Invalid saved player name'}};
 const filters=parseFilters(raw);
 if(!filters)return{status:400,body:{error:'Invalid opponent scouting filter'}};
 const players=await read(db.from('players')
  .select('id,gamertag,platform,pubg_account_id')
  .ilike('gamertag',escapeLike(name)).limit(10));
 const player=(players||[]).find(p=>p.gamertag?.toLowerCase()===name.toLowerCase()&&
  ['xbox','psn'].includes(p.platform)&&ACCOUNT.test(p.pubg_account_id||''));
 if(!player)return{status:404,body:{error:'Saved console player not found'}};
 const now=services.now??Date.now(),since=new Date(now-filters.days*86400_000).toISOString();
 const archive=await read(db.from('clan_match_archive').select('match_id,played_at')
  .eq('player_id',player.id).gte('played_at',since)
  .order('played_at',{ascending:false}).limit(MAX_MATCHES));
 const ids=[...new Set((archive||[]).map(r=>r?.match_id?.toLowerCase())
  .filter(id=>typeof id==='string'&&MATCH_ID.test(id)))].slice(0,MAX_MATCHES);
 if(!ids.length)return{status:200,body:{
  ...summarizeLobbies([],player.pubg_account_id,filters,now),name:player.gamertag,
  platform:player.platform,savedMatchesScanned:0,fullLobbiesFound:0,
  source:'180-day official saved full-match archive'
 }};
 const records=await read(db.from('pubg_match_lobby_archive')
  .select('match_id,played_at,source_fetched_at,compact_match')
  .in('match_id',ids).gte('played_at',since).limit(MAX_MATCHES));
 const selected=new Set(ids);
 const verified=(records||[]).filter(row=>selected.has(row.match_id?.toLowerCase()));
 const report=summarizeLobbies(verified,player.pubg_account_id,filters,now);
 return{status:200,body:{...report,name:player.gamertag,platform:player.platform,
  savedMatchesScanned:ids.length,fullLobbiesFound:verified.length,
  source:'180-day official saved full-match archive'}};
}
module.exports={publicLobbyOpponents,summarizeLobbies,parseFilters,MAX_MATCHES,MAX_NAMES,MAX_DETAIL};
