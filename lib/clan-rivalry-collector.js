'use strict';
// Bounded automatic PUBG kill rivalry collection for verified current clan
// players. Only saved full-match JSON and the exact publisher telemetry CDN.
// No PUBG player API calls, spatial tracks, replays or new hosting function.
const {validTelemetryUrl,parseTelemetry,UUID}=require('./web-telemetry');
const {visibleName}=require('./web-rival-intelligence');
const ACCOUNT=/^[a-zA-Z0-9._-]{8,160}$/;
const MAX_MATCHES=2,MAX_CLAN_PARTICIPANTS=25;
const DURATION=180*86400_000;
const validDate=s=>typeof s==='string'&&Number.isFinite(Date.parse(s));
const count=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:0;
async function read(query,label){
 const result=await query;
 if(result.error)throw Error(label+' unavailable');
 return result.data;
}
function officialAccounts(payload,queue){
 const seen=new Set(),present=new Set(
  (Array.isArray(payload?.included)?payload.included:[])
   .filter(p=>p?.type==='participant'&&ACCOUNT.test(p?.attributes?.stats?.playerId||''))
   .map(p=>p.attributes.stats.playerId));
 return (Array.isArray(queue)?queue:[]).filter(p=>{
  const id=p?.pubg_account_id;
  if(!ACCOUNT.test(id||'')||!present.has(id)||seen.has(id)||
   !['xbox','psn'].includes(p.platform)||p.status!=='matched'||
   p.is_clan_member!==true)return false;
  seen.add(id);return true;
 }).slice(0,MAX_CLAN_PARTICIPANTS);
}
function deriveKillReports(events,members,{matchId,playedAt,map,mode}){
 const targets=new Map();
 for(const member of members)targets.set(member.pubg_account_id,new Map());
 for(const event of Array.isArray(events)?events:[]){
  if(!['LogPlayerKill','LogPlayerKillV2'].includes(event?._T))continue;
  const a=event.killer,b=event.victim;
  const killer=a?.accountId,victim=b?.accountId;
  if(!ACCOUNT.test(killer||'')||!ACCOUNT.test(victim||'')||
    killer===victim||event.isSuicide===true||event.isTeamKill===true||
    (a?.teamId!=null&&b?.teamId!=null&&a.teamId===b.teamId))continue;
  function increase(id,opponent,field){
   const group=targets.get(id);
   if(!group)return;
   const label=visibleName(opponent?.name);
   if(!label)return;
   const existing=group.get(opponent.accountId)||{
    name:label,kills:0,deaths:0
   };
   existing[field]++;
   group.set(opponent.accountId,existing);
  }
  increase(killer,b,'kills');
  increase(victim,a,'deaths');
 }
 return [...targets].map(([accountId,group])=>({
  accountId,
  payload:{
   schemaVersion:1,matchId,playedAt,matchMap:String(map||'Unknown map').slice(0,90),
   mode:String(mode||'Unknown mode').slice(0,90),
   rivals:[...group.values()].sort((a,b)=>
    b.kills+b.deaths-a.kills-a.deaths||a.name.localeCompare(b.name))
    .slice(0,60).map(r=>({
      name:r.name,kills:r.kills,deaths:r.deaths,
      damageDealt:null,damageTaken:null,matchesSampled:1
    }))
  }
 }));
}
async function finish(db,job,until,services={}){
 const next=new Date(until).toISOString();
 const row=await read(db.from('web_refresh_guard')
  .update({next_allowed:next})
  .eq('scope','kill-rivalry:match:'+job.match_id)
  .eq('updated_at',job.lease_at).select('scope'),'Finish fenced rivalry claim');
 return Array.isArray(row)&&row.length===1;
}
async function collectOne(db,job,services={}){
 const now=services.now??Date.now();
 const id=job?.match_id;
 if(!UUID.test(id||'')||!validDate(job?.lease_at))
  throw Error('Invalid private rivalry lease');
 const record=await read(db.from('pubg_endpoint_cache').select('payload')
  .eq('cache_key','pubg:v1:console/matches/'+id).maybeSingle(),'Saved official match');
 const payload=record?.payload;
 if(payload?.data?.id?.toLowerCase()!==id.toLowerCase()||
    !Array.isArray(payload?.included))
  return {status:'source_missing',savedPlayers:0};
 const attributes=payload.data.attributes||{},played=attributes.createdAt;
 if(!validDate(played)||Date.parse(played)>now+86400_000||
    Date.parse(played)<now-14*86400_000)
  return{status:'outside_source_window',savedPlayers:0};
 const ids=[...new Set(payload.included.filter(p=>p?.type==='participant')
  .map(p=>p?.attributes?.stats?.playerId)
  .filter(x=>ACCOUNT.test(x||'')))].slice(0,150);
 if(!ids.length)return{status:'no_verified_member',savedPlayers:0};
 const queue=await read(db.from('player_import_queue')
  .select('pubg_account_id,platform,status,is_clan_member')
  .in('pubg_account_id',ids).eq('status','matched')
  .eq('is_clan_member',true).limit(150),'Verified clan membership');
 const members=officialAccounts(payload,queue);
 if(!members.length)return{status:'no_verified_member',savedPlayers:0};
 const keys=members.map(m=>'web:kill-rivalry:v1:'+id+':'+m.pubg_account_id);
 const old=await read(db.from('pubg_endpoint_cache')
  .select('cache_key,expires_at,payload').in('cache_key',keys),
  'Existing kill-only reports');
 const completed=new Set((old||[]).filter(r=>
  r.payload?.schemaVersion===1&&r.payload.matchId===id&&
  validDate(r.expires_at)&&Date.parse(r.expires_at)>now)
  .map(r=>r.cache_key));
 const missing=members.filter(m=>
  !completed.has('web:kill-rivalry:v1:'+id+':'+m.pubg_account_id));
 if(!missing.length)return{status:'already_saved',savedPlayers:0,reused:members.length,
  playedAt:played};
 const rawUrl=payload.included.find(p=>p?.type==='asset')?.attributes?.URL;
 const url=validTelemetryUrl(rawUrl);
 if(!url)return{status:'source_missing',savedPlayers:0};
 const events=await (services.parseTelemetry||parseTelemetry)(services.fetcher||fetch,url);
 const reports=deriveKillReports(events,missing,{
  matchId:id,playedAt:played,map:attributes.mapName,mode:attributes.gameMode
 });
 const expiresAt=new Date(Date.parse(played)+DURATION).toISOString();
 let savedPlayers=0;
 for(const item of reports){
  await read(db.from('pubg_endpoint_cache').upsert({
   cache_key:'web:kill-rivalry:v1:'+id+':'+item.accountId,
   payload:item.payload,fetched_at:new Date(now).toISOString(),
   expires_at:expiresAt
  },{onConflict:'cache_key'}).select('cache_key'),'Store private rivalries');
  savedPlayers++;
 }
 return{status:'saved',savedPlayers,reused:completed.size,playedAt:played};
}
async function collectClanRivalries(db,services={}){
 const result={status:'no_work',claimed:0,matchesSaved:0,playersSaved:0,
  existingPlayers:0,unavailable:0,errors:0};
 const size=Math.min(MAX_MATCHES,Math.max(1,Number(services.batchSize)||MAX_MATCHES));
 const claims=await read(db.rpc('claim_clan_kill_rivalry_matches',{p_limit:size}),
  'Claim due match kill records');
 const jobs=Array.isArray(claims)?claims:[];
 result.claimed=jobs.length;
 // At most 2 simultaneous bounded (32MB max) official telemetry downloads.
 await Promise.all(jobs.map(async job=>{
  let processed=null,next=(services.now??Date.now())+3*3600_000;
  try{
   processed=await collectOne(db,job,services);
   if(processed.status==='saved'||processed.status==='already_saved'){
    next=Date.parse(processed.playedAt)+DURATION;
    result.matchesSaved++;
    result.playersSaved+=count(processed.savedPlayers);
    result.existingPlayers+=count(processed.reused);
   }else result.unavailable++;
  }catch(error){
   console.error('Clan kill-rivalry collector could not process saved match:',error.message);
   result.errors++;
  }
  try{
   if(!await finish(db,job,next,services))result.errors++;
  }catch(error){
   console.error('Clan kill-rivalry lease could not be completed:',error.message);
   result.errors++;
  }
 }));
 result.status=result.errors?'partial':result.unavailable?'partial':
  jobs.length?'processed':'no_work';
 return result;
}
module.exports={collectClanRivalries,collectOne,deriveKillReports,officialAccounts,
 finish,MAX_MATCHES,MAX_CLAN_PARTICIPANTS};
