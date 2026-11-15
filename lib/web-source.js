'use strict';
const {escapeLike}=require('./pubg-utils');
const KINDS=new Set(['profile','seasons','season','ranked','weapons','survival','match']);
const ID=/^[a-zA-Z0-9._-]{4,128}$/;
const MATCH=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRIVATE=new Set(['id','playerId','accountId','player_id','pubg_account_id',
 'url','URL','token','authorization','auth','key','secret','telemetryUrl']);
function safeSource(value,depth=0) {
 if(depth>24)return'[Nested source truncated]';
 if(Array.isArray(value))return value.slice(0,2000).map(x=>safeSource(x,depth+1));
 if(value&&typeof value==='object'){
  const result={};
  for(const [key,part] of Object.entries(value).slice(0,2500)){
   if(PRIVATE.has(key)||/^(?:access|private|secret|api)[_-]?(?:key|token)$/i.test(key))continue;
   result[key]=safeSource(part,depth+1);
  }
  return result;
 }
 return value===null||typeof value==='string'||typeof value==='boolean'||
  typeof value==='number'?value:null;
}
async function read(query){
 const result=await query;
 if(result.error)throw Error('Saved PUBG source unavailable');
 return result.data;
}
async function publicSource(db,{name,platform='auto',kind='profile',match}={}){
 if(typeof name!=='string'||!name.trim()||name!==name.trim()||name.length>100||
  /[,\u0000-\u001f\u007f]/.test(name)||
  !['auto','xbox','psn'].includes(platform)||!KINDS.has(kind)||
  (kind==='match'&&!MATCH.test(match||'')))
  return{status:400,body:{error:'Invalid source selection'}};
 const players=await read(db.from('players').select('gamertag,platform,pubg_account_id')
   .ilike('gamertag',escapeLike(name)).limit(10));
 const exact=(players||[]).filter(p=>p.gamertag?.toLowerCase()===name.toLowerCase()&&
  ['xbox','psn'].includes(p.platform)&&
  /^[a-zA-Z0-9._-]{8,160}$/.test(p.pubg_account_id||''));
 const consoles=[...new Set(exact.map(p=>p.platform))];
 // Source exports must not silently return the wrong console account.
 if(platform==='auto'&&consoles.length>1)
  return{status:409,body:{
   error:'This saved gamertag exists on Xbox and PlayStation. Select a console to inspect the correct saved source.',
   code:'platform_ambiguous',choices:consoles
  }};
 const person=exact.find(p=>platform==='auto'||platform===p.platform);
 if(!person)return{status:404,body:{error:'No verified saved account on that console'}};
 const prefix='pubg:v1:'+person.platform+'/';
 async function cached(key){
  return read(db.from('pubg_endpoint_cache').select('payload,fetched_at')
    .eq('cache_key',key).maybeSingle());
 }
 let resource=kind,entry=null,seasonId=null;
 if(kind==='profile')entry=await cached(prefix+'players/'+person.pubg_account_id);
 else if(kind==='seasons')entry=await cached(prefix+'seasons');
 else if(kind==='weapons'||kind==='survival')
  entry=await cached(prefix+'players/'+person.pubg_account_id+
    (kind==='weapons'?'/weapon_mastery':'/survival_mastery'));
 else if(kind==='match')
  entry=await cached('pubg:v1:console/matches/'+match);
 else {
  const seasons=await cached(prefix+'seasons');
  const items=Array.isArray(seasons?.payload?.data)?seasons.payload.data:[];
  const current=items.find(x=>x?.attributes?.isCurrentSeason&&!x?.attributes?.isOffseason)||
    items.find(x=>x?.attributes?.isCurrentSeason);
  if(!ID.test(current?.id||''))
   return{status:404,body:{error:'Current season is not saved yet'}};
  seasonId=current.id;
  entry=await cached(prefix+'players/'+person.pubg_account_id+
    '/seasons/'+seasonId+(kind==='ranked'?'/ranked':''));
 }
 if(!entry?.payload)return{status:404,body:{error:'No genuine saved PUBG response for this resource. Refresh the player through the existing website first.'}};
 const payload=entry.payload;
 let allowed;
 if(kind==='seasons')allowed=(Array.isArray(payload.data)?payload.data:[])
   .slice(0,150).map(s=>({season:s.id,attributes:safeSource(s.attributes)}));
 else if(kind==='match'){
  const included=Array.isArray(payload.included)?payload.included:[];
  const participant=included.some(x=>x.type==='participant'&&
    x.attributes?.stats?.playerId===person.pubg_account_id);
  if(!participant)return{status:404,body:{error:'This saved player is not a participant in the selected match'}};
  allowed={match:safeSource(payload.data?.attributes),
   participants:included.filter(x=>x.type==='participant').slice(0,120)
    .map(x=>({type:'participant',stats:safeSource(x.attributes?.stats)})),
   rosters:included.filter(x=>x.type==='roster').slice(0,50)
    .map(x=>({type:'roster',attributes:safeSource(x.attributes)}))};
 }else allowed=safeSource(payload.data?.attributes);
 if(allowed===undefined||allowed===null)
  return{status:404,body:{error:'Saved source has no usable attributes'}};
 const bytes=Buffer.byteLength(JSON.stringify(allowed),'utf8');
 if(bytes>650000)return{status:413,body:{error:'This sanitized source exceeds the safe public response size limit'}};
 return{status:200,body:{
  schemaVersion:1,name:person.gamertag,platform:person.platform,
  resource,seasonId,fetchedAt:entry.fetched_at||null,
  source:'Actual saved official PUBG response; account identifiers, URLs and secrets excluded',
  bytes,payload:allowed
 }};
}
module.exports={publicSource,safeSource,KINDS};
