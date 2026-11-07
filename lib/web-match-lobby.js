'use strict';
// A verified, read-only scoreboard built from a *previously stored* PUBG match
// response. Neither this module nor its handler contacts PUBG or the CDN.
const {escapeLike}=require('./pubg-utils');
const MATCH_ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACCOUNT=/^[a-zA-Z0-9._-]{8,160}$/;
const MAX_PLAYERS=150,MAX_TEAMS=150;
const number=value=>{
 if((typeof value!=='number'&&typeof value!=='string')||
   (typeof value==='string'&&!value.trim()))return null;
 const n=Number(value);
 return Number.isFinite(n)&&n>=0&&n<=1e8?n:null;
};
const positive=value=>{
 const n=number(value);
 return n!==null&&Number.isInteger(n)&&n>0&&n<=150?n:null;
};
function safeText(value,otherwise=''){
 if(typeof value!=='string'||!value.trim())return otherwise;
 return value.trim().slice(0,100).replace(/[\u0000-\u001f\u007f]/g,'');
}
function playerName(name){
 const text=safeText(name);
 return !text||/^account[._-]/i.test(text)?'Unnamed participant':text;
}
function date(value){
 if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))return null;
 return new Date(value).toISOString();
}
const death=value=>['alive','byplayer','byzone','suicide','logout'].includes(value)?value:null;
function safePlayer(participant,self){
 const stats=participant?.attributes?.stats||{};
 return{
  name:playerName(stats.name),isSelf:participant?.id===self,
  placement:positive(stats.winPlace),killPlacement:positive(stats.killPlace),
  kills:number(stats.kills),damage:number(stats.damageDealt),
  knocks:number(stats.DBNOs),assists:number(stats.assists),
  headshots:number(stats.headshotKills),revives:number(stats.revives),
  heals:number(stats.heals),boosts:number(stats.boosts),
  killStreaks:number(stats.killStreaks),longestKillMeters:number(stats.longestKill),
  roadKills:number(stats.roadKills),teamKills:number(stats.teamKills),
  vehicleDestroys:number(stats.vehicleDestroys),
  timeSurvivedSeconds:number(stats.timeSurvived),
  walkMeters:number(stats.walkDistance),driveMeters:number(stats.rideDistance),
  swimMeters:number(stats.swimDistance),weaponsAcquired:number(stats.weaponsAcquired),
  deathType:death(stats.deathType)
 };
}
function total(members,key){
 const values=members.map(p=>p[key]).filter(x=>x!==null);
 return{value:values.length?values.reduce((a,b)=>a+b,0):null,observed:values.length};
}
function shapeLobby(payload,accountId,matchId,savedAt){
 const root=payload?.data,source=Array.isArray(payload?.included)?payload.included:[];
 if(!root||typeof root.id!=='string'||root.id.toLowerCase()!==matchId.toLowerCase())
  return null;
 const participants=source.filter(p=>p?.type==='participant'&&typeof p.id==='string')
  .slice(0,MAX_PLAYERS);
 const self=participants.find(p=>p.attributes?.stats?.playerId===accountId);
 if(!self)return null;
 const mapped=new Map();
 for(const part of participants)if(!mapped.has(part.id))mapped.set(part.id,part);
 const used=new Set(),teamList=[];
 for(const roster of source.filter(p=>p?.type==='roster').slice(0,MAX_TEAMS)){
  const ids=roster.relationships?.participants?.data;
  if(!Array.isArray(ids))continue;
  const members=[];
  for(const ref of ids.slice(0,8)){
   const id=ref?.id,part=mapped.get(id);
   if(!part||used.has(id))continue;
   used.add(id);
   members.push(safePlayer(part,self.id));
  }
  if(!members.length)continue;
  teamList.push({
   placement:positive(roster.attributes?.stats?.rank),
   isOwnTeam:members.some(p=>p.isSelf),
   assignedRoster:true,
   players:members,
   kills:total(members,'kills'),damage:total(members,'damage'),
   knocks:total(members,'knocks')
  });
 }
 // A roster can be absent from incomplete saved PUBG payloads. Unassigned
 // participants stay individually ungrouped; never invent a shared team.
 for(const part of participants){
  if(used.has(part.id))continue;
  used.add(part.id);
  const members=[safePlayer(part,self.id)];
  teamList.push({placement:null,isOwnTeam:members[0].isSelf,
   assignedRoster:false,players:members,
   kills:total(members,'kills'),damage:total(members,'damage'),
   knocks:total(members,'knocks')});
 }
 teamList.sort((a,b)=>
  (a.placement??999)-(b.placement??999)||
  Number(b.isOwnTeam)-Number(a.isOwnTeam)||
  (b.kills.value??-1)-(a.kills.value??-1)||
  a.players[0].name.localeCompare(b.players[0].name));
 const teams=teamList.map((t,i)=>({...t,displayIndex:i+1}));
 const actual=teams.reduce((a,t)=>a+t.players.length,0);
 return{
  schemaVersion:1,kind:'match-lobby',matchId:matchId.toLowerCase(),
  map:safeText(root.attributes?.mapName,'Unknown map'),
  mode:safeText(root.attributes?.gameMode,'Unknown mode'),
  matchType:safeText(root.attributes?.matchType,'Unknown type'),
  playedAt:date(root.attributes?.createdAt),
  durationSeconds:number(root.attributes?.duration),savedAt:date(savedAt),
  participantsInSource:participants.length,playersShown:actual,teamsShown:teams.length,
  ownTeamPosition:teams.findIndex(t=>t.isOwnTeam)+1,
  teams,
  note:'This is the lobby stored in the official PUBG match response, not a live server or lifetime leaderboard. The squad placement comes from recorded roster rank only; unknown ranks remain unavailable. Individual stats are source values; squad totals show how many member values were observed. Missing rosters leave players unassigned rather than guessing teams. The archived personal match summary can outlive the full-lobby cache. No PUBG or telemetry request was made.'
 };
}
async function read(query){
 const result=await query;
 if(result.error)throw Error('Saved match lobby data temporarily unavailable');
 return result.data;
}
async function publicMatchLobby(db,{name,match}={}){
 if(typeof name!=='string'||name!==name.trim()||!name.trim()||
   name.length>100||/[,\u0000-\u001f\u007f]/.test(name)||
   typeof match!=='string'||!MATCH_ID.test(match))
  return{status:400,body:{error:'Choose a saved console player and valid match'}};
 const players=await read(db.from('players')
  .select('gamertag,platform,pubg_account_id')
  .ilike('gamertag',escapeLike(name)).limit(10));
 const player=(players||[]).find(p=>
  String(p.gamertag||'').toLowerCase()===name.toLowerCase()&&
  ['xbox','psn'].includes(p.platform)&&ACCOUNT.test(p.pubg_account_id||''));
 if(!player)return{status:404,body:{error:'Saved console player not found'}};
 const id=match.toLowerCase();
 const record=await read(db.from('pubg_endpoint_cache')
  .select('payload,fetched_at').eq('cache_key','pubg:v1:console/matches/'+id)
  .maybeSingle());
 const live=record?.payload&&shapeLobby(record.payload,
   player.pubg_account_id,id,record.fetched_at);
 if(live)return{status:200,body:{...live,player:player.gamertag,
   platform:player.platform,archived:false,
   source:'Saved official PUBG match cache'}};
 // Personal 180-day summaries retain only the player's squad, so use an
 // independently saved sanitized lobby when the original JSON is unavailable.
 const since=new Date(Date.now()-180*86400_000).toISOString();
 const stored=await read(db.from('pubg_match_lobby_archive')
  .select('compact_match,source_fetched_at,archived_at,played_at')
  .eq('match_id',id).gte('played_at',since).maybeSingle());
 const saved=stored?.compact_match&&shapeLobby(stored.compact_match,
   player.pubg_account_id,id,stored.source_fetched_at);
 if(saved)return{status:200,body:{...saved,player:player.gamertag,
   platform:player.platform,archived:true,
   archivedAt:stored.archived_at||null,
   source:'Sanitized 180-day official PUBG match lobby archive',
   note:'This is an archived official PUBG match participant and roster report, retained for up to 180 days from when the game was played. Squad ranks and member statistics are direct source observations; missing data is not invented. The archive contains no telemetry downloads, URLs or extra PUBG requests.'}};
 return{status:404,body:{
  error:record?.payload?
   'This saved match has no verified participant entry for this console player.':
   'No complete saved lobby is available for this match. The 180-day personal archive can retain a player summary without the original full lobby; missing squads cannot be reconstructed.'
 }};

}
module.exports={publicMatchLobby,shapeLobby,safePlayer,number,MAX_PLAYERS,MAX_TEAMS};
