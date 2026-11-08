'use strict';
const {escapeLike}=require('./pubg-utils');
const {analyseSavedRivals,parseRivalFilters}=require('./web-rival-intelligence');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACCOUNT=/^[a-zA-Z0-9._-]{8,160}$/;
const MAX_BYTES=32*1024*1024;
const MAX_EVENTS=160000;
function validTelemetryUrl(value){
 try{
  const u=new URL(value);
  return u.protocol==='https:'&&u.hostname==='telemetry-cdn.pubg.com'&&
   !u.username&&!u.password&&!u.port&&!u.hash?u.href:null;
 }catch{return null;}
}
function number(n){return typeof n==='number'&&Number.isFinite(n)?n:null;}
function short(s){return typeof s==='string'?s.slice(0,90):'Unknown';}
function sampleLimit(rows,cap){
 if(rows.length<=cap)return rows;
 const selected=[];
 for(let i=0;i<cap;i++)selected.push(rows[Math.round(i*(rows.length-1)/(cap-1))]);
 return selected;
}
function shapeTelemetry(events,accountId,match,source){
 const summary={
  damageDealt:0,damageTaken:0,knocks:0,revives:0,healing:0,
  kills:0,deaths:0,missingDamageEvents:0,missingHealingEvents:0
 };
 let dealtObserved=false,takenObserved=false,healObserved=false;
 const rivalMap=new Map(),weapons=new Map(),types=new Map(),activity=[];
 function teamKill(a,b){
  return a?.teamId!==undefined&&a?.teamId!==null&&
   b?.teamId!==undefined&&b?.teamId!==null&&a.teamId===b.teamId;
 }
 function rival(p){
  const key=p?.accountId;
  if(typeof key!=='string'||key===accountId)return null;
  const entry=rivalMap.get(key)||{name:short(p.name||'Unknown'),kills:0,deaths:0,
   dealt:0,taken:0,encounters:0,damageSamples:0};
  rivalMap.set(key,entry);return entry;
 }
 for(let index=0;index<events.length;index++){
  const e=events[index]||{},type=e._T;
  if(typeof type!=='string')continue;
  types.set(type,(types.get(type)||0)+1);
  const a=['LogPlayerKill','LogPlayerKillV2'].includes(type)?e.killer:e.attacker;
  const b=e.victim;
  const outgoing=a?.accountId===accountId,incoming=b?.accountId===accountId;
  const involved=outgoing||incoming||
   e.character?.accountId===accountId||e.reviver?.accountId===accountId||
   e.killer?.accountId===accountId;
  const excluded=(type==='LogPlayerKill'||type==='LogPlayerKillV2')&&
   (e.isSuicide===true||(a?.accountId&&a.accountId===b?.accountId)||teamKill(a,b));
  if(type==='LogPlayerTakeDamage'&&(outgoing||incoming)){
   const amount=number(e.damage);
   if(amount===null)summary.missingDamageEvents++;
   else {
    if(outgoing){summary.damageDealt+=amount;dealtObserved=true;}
    if(incoming){summary.damageTaken+=amount;takenObserved=true;}
    if(!teamKill(a,b)&&a?.accountId!==b?.accountId){
     const other=rival(outgoing?b:a);
     if(other){
      if(outgoing)other.dealt+=amount;
      else other.taken+=amount;
      other.damageSamples++;
     }
    }
    if(outgoing){
     const weapon=short(e.damageCauserName||'Unknown cause');
     weapons.set(weapon,(weapons.get(weapon)||0)+amount);
    }
   }
  }else if(type==='LogPlayerMakeGroggy'&&outgoing&&!teamKill(a,b)){
   summary.knocks++;
  }else if((type==='LogPlayerKill'||type==='LogPlayerKillV2')&&
   (outgoing||incoming)&&!excluded){
   if(outgoing)summary.kills++;else summary.deaths++;
   const other=rival(outgoing?b:a);
   if(other){
    other[outgoing?'kills':'deaths']++;
    other.encounters++;
   }
  }else if(type==='LogPlayerRevive'&&e.reviver?.accountId===accountId){
   summary.revives++;
  }else if(type==='LogHeal'&&e.character?.accountId===accountId){
   const amt=number(e.healAmount??e.healamount);
   if(amt===null)summary.missingHealingEvents++;
   else{summary.healing+=amt;healObserved=true;}
  }
  // Track meaningful player events without recording positional movement.
  // Return bounded activity, not a misleading first-N-event slice.
  if(involved&&type!=='LogPlayerPosition'&&type!=='LogGameStatePeriodic'){
   activity.push({
    sourceIndex:index,type,timestamp:typeof e._D==='string'?e._D:null,
    actor:short(a?.name||e.reviver?.name||e.character?.name||'Unknown'),
    subject:short(b?.name||''),
    damage:type==='LogPlayerTakeDamage'?number(e.damage):null
   });
  }
 }
 // Event timing needs no coordinates, spatial tracks, circles or playback.
 const times=events.map(e=>Date.parse(e?._D)).filter(Number.isFinite);
 const eventOrigin=times.length?times.reduce((earliest,t)=>Math.min(earliest,t),Infinity):null;
 summary.damageDealt=dealtObserved?summary.damageDealt:null;
 summary.damageTaken=takenObserved?summary.damageTaken:null;
 summary.healing=healObserved?summary.healing:null;
 const rivals=[...rivalMap.values()].filter(r=>r.encounters||r.damageSamples)
  .sort((a,b)=>b.kills+b.deaths-a.kills-a.deaths||
   b.dealt+b.taken-a.dealt-a.taken).slice(0,60)
  .map(r=>({
   name:r.name,kills:r.kills,deaths:r.deaths,
   damageDealt:r.damageSamples?r.dealt:null,
   damageTaken:r.damageSamples?r.taken:null,
   matchesSampled:1
  }));
 return{
  schemaVersion:1,matchId:match,matchMap:short(source.mapName),
  playedAt:source.playedAt||null,mode:short(source.mode),
  sourceEvents:events.length,combatSummary:summary,rivals,
  weapons:[...weapons].sort((a,b)=>b[1]-a[1]).slice(0,30)
   .map(([name,damage])=>({name,damage})),
  eventTypes:[...types].sort((a,b)=>b[1]-a[1]).slice(0,60)
   .map(([type,count])=>({type,count})),
  playerEvents:sampleLimit(activity,1200).map(a=>Object.assign({},a,{
    timeSeconds:eventOrigin!==null&&a.timestamp&&Number.isFinite(Date.parse(a.timestamp))?
      Math.max(0,(Date.parse(a.timestamp)-eventOrigin)/1000):null
  })),
  activityCoverage:{observed:activity.length,returned:Math.min(activity.length,1200),
    truncated:activity.length>1200},
  note:'Only genuine PUBG match events are analysed. Opponent encounters and combat totals are match-local observations, not career statistics. No location tracks, playback, or 2D replays are generated.'
 };
}
async function parseTelemetry(fetcher,url){
 const response=await fetcher(url,{headers:{Accept:'application/json'},
  redirect:'error',signal:AbortSignal.timeout(22000)});
 if(!response?.ok)throw Error('PUBG telemetry is temporarily unavailable');
 const length=Number(response.headers?.get?.('content-length')||0);
 if(length>MAX_BYTES)throw Error('PUBG telemetry exceeds safe size limit');
 let text;
 if(response.body?.getReader){
  const reader=response.body.getReader(),parts=[];
  let total=0;
  while(true){
   const next=await reader.read();
   if(next.done)break;
   total+=next.value.byteLength;
   if(total>MAX_BYTES){await reader.cancel();throw Error('PUBG telemetry exceeds safe size limit');}
   parts.push(Buffer.from(next.value));
  }
  text=Buffer.concat(parts,total).toString('utf8');
 }else{
  text=await response.text();
  if(Buffer.byteLength(text,'utf8')>MAX_BYTES)
   throw Error('PUBG telemetry exceeds safe size limit');
 }
 let events;
 try{events=JSON.parse(text);}catch{throw Error('PUBG telemetry JSON unavailable');}
 if(!Array.isArray(events)||events.length>MAX_EVENTS)
  throw Error('PUBG telemetry event list exceeds safe limits');
 return events;
}
async function read(query,name){
 const result=await query;
 if(result.error)throw Error(name+' unavailable');
 return result.data;
}
async function publicTelemetry(db,{name,match}={},services={}){
 if(typeof name!=='string'||!name.trim()||name!==name.trim()||
   name.length>100||/[,\u0000-\u001f\u007f]/.test(name)||
   !UUID.test(match||''))return{status:400,body:{error:'Invalid player or match UUID'}};
 const players=await read(db.from('players').select('gamertag,platform,pubg_account_id')
   .ilike('gamertag',escapeLike(name)).limit(10),'Saved player');
 const player=(players||[]).find(p=>p.gamertag?.toLowerCase()===name.toLowerCase()&&
   ['xbox','psn'].includes(p.platform)&&ACCOUNT.test(p.pubg_account_id||''));
 if(!player)return{status:404,body:{error:'Saved console player not found'}};
 const record=await read(db.from('pubg_endpoint_cache').select('payload,fetched_at')
   .eq('cache_key','pubg:v1:console/matches/'+match).maybeSingle(),'Saved match');
 const payload=record?.payload;
 const participant=(payload?.included||[]).find(p=>p.type==='participant'&&
  p.attributes?.stats?.playerId===player.pubg_account_id);
 if(!participant)return{status:404,body:{
  error:'No saved match participant record for this player. Refresh recent matches first.'}};
 const rawUrl=(payload.included||[]).find(p=>p.type==='asset')?.attributes?.URL;
 const url=validTelemetryUrl(rawUrl);
 if(!url)return{status:404,body:{
  error:'This cached match has no trusted PUBG telemetry asset.'}};
 const key='web:telemetry:v1:'+match+':'+player.pubg_account_id;
 const old=await read(db.from('pubg_endpoint_cache').select('payload,expires_at,fetched_at')
   .eq('cache_key',key).maybeSingle(),'Cached report');
 if(old?.payload?.schemaVersion===1&&Date.parse(old.expires_at)>Date.now()){
  // Legacy cached reports may still contain an old spatial replay field.
  // Never return its coordinates or tracks to the browser.
  const {replay:_discardedReplay,...analysis}=old.payload;
  return{status:200,body:{...analysis,player:player.gamertag,platform:player.platform,
   analysedAt:old.fetched_at,cache:'saved'}};
 }
 const allowed=await read(db.rpc('reserve_web_refresh',{
  p_player_key:player.platform+':telemetry:'+match
 }),'Shared refresh budget');
 if(!allowed)return{status:429,body:{
  error:'Shared web refresh budget is cooling down; retry shortly.',retryAfterSeconds:90}};
 try{
  const events=await parseTelemetry(services.fetcher||fetch,url);
  const attr=payload.data?.attributes||{};
  const report=shapeTelemetry(events,player.pubg_account_id,match,{
   mapName:attr.mapName,playedAt:attr.createdAt,mode:attr.gameMode
  });
  const bytes=Buffer.byteLength(JSON.stringify(report));
  if(bytes>3*1024*1024)throw Error('Derived report exceeds safe response size');
  const now=new Date(),expires=new Date(now.getTime()+24*3600*1000);
  let cache='uncached';
  try{
   await read(db.from('pubg_endpoint_cache').upsert({
    cache_key:key,payload:report,fetched_at:now.toISOString(),
    expires_at:expires.toISOString()
   },{onConflict:'cache_key'}).select('cache_key'),'Store bounded telemetry report');
   cache='saved';
  }catch(error){console.error('Telemetry derived cache unavailable:',error.message);}
  return{status:200,body:{...report,player:player.gamertag,platform:player.platform,
   analysedAt:now.toISOString(),cache}};
 }catch(error){
  console.error('Trusted PUBG telemetry processing failed:',error.message);
  return{status:503,body:{error:'Trusted PUBG match telemetry unavailable or too large'}};
 }
}

async function publicRivalTrends(db,{name,days,map,mode,opponent}={},services={}){
 if(typeof name!=='string'||!name.trim()||name!==name.trim()||
    name.length>100||/[,\u0000-\u001f\u007f]/.test(name)||
    !parseRivalFilters({days,map,mode,opponent}))
  return{status:400,body:{error:'Invalid player name or rival filter'}};
 const players=await read(db.from('players').select('gamertag,platform,pubg_account_id')
   .ilike('gamertag',escapeLike(name)).limit(10),'Saved player');
 const player=(players||[]).find(p=>p.gamertag?.toLowerCase()===name.toLowerCase()&&
   ['xbox','psn'].includes(p.platform)&&ACCOUNT.test(p.pubg_account_id||''));
 if(!player)return{status:404,body:{error:'Saved console player not found'}};
 // Service role reads cached derived telemetry for one verified account only.
 // The exact suffix check rejects unrelated matching names and prefix collisions.
 const suffix=':'+player.pubg_account_id;
 const rows=await read(db.from('pubg_endpoint_cache')
   .select('cache_key,payload,fetched_at')
   .like('cache_key','web:telemetry:v1:%'+escapeLike(suffix))
   .order('fetched_at',{ascending:false}).limit(100),'Saved match analysis');
 const result=analyseSavedRivals(rows,player.pubg_account_id,
  {days,map,mode,opponent},services.now??Date.now());
 return{status:200,body:{
  ...result,player:player.gamertag,platform:player.platform
 }};
}

module.exports={publicTelemetry,publicRivalTrends,shapeTelemetry,validTelemetryUrl,parseTelemetry,UUID};
