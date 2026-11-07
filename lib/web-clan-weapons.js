'use strict';
// Read-only verified-clan weapon mastery. All facts come from existing saved
// official PUBG cache responses. No upstream requests or API-budget RPC calls.
const {weaponItems}=require('./web-insights');
const METRICS=Object.freeze(['kills','headshots','knocks','damage','defeats','longestKill']);
const SOURCES=Object.freeze(['official','competitive','total']);
const MAX_PLAYERS=250;
const text=value=>typeof value==='string'?value.slice(0,100):'';
const numeric=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1e10?value:null;
const validAccount=value=>typeof value==='string'&&/^[a-zA-Z0-9._-]{8,160}$/.test(value);
async function read(query){
 const result=await query;
 if(result.error)throw Error('Saved clan weapon data temporarily unavailable');
 return result.data||[];
}
function summaryBuckets(){
 return Object.fromEntries(SOURCES.map(source=>[source,{
  metrics:Object.fromEntries(METRICS.map(key=>[key,{count:0,sum:0,max:null}])),
  players:0,leaderCandidates:[]
 }]));
}
function aggregateWeaponRecords(records){
 const weapons=new Map();
 for(const record of records){
  if(!record||!['xbox','psn'].includes(record.platform)||!text(record.name).trim())continue;
  const seen=new Set();
  for(const weapon of weaponItems(record.payload)){
   const key=weapon.name.toLowerCase();
   if(seen.has(key))continue;
   seen.add(key);
   if(!weapons.has(key))weapons.set(key,{
    name:weapon.name,playersWithRecord:0,sources:summaryBuckets()
   });
   const target=weapons.get(key);
   target.playersWithRecord++;
   for(const source of SOURCES){
    const values=weapon[source];
    if(!values)continue;
    const observed=METRICS.filter(metric=>numeric(values[metric])!==null);
    if(!observed.length)continue;
    const output=target.sources[source];
    output.players++;
    for(const metric of observed){
     const n=numeric(values[metric]),m=output.metrics[metric];
     m.count++;
     if(metric==='longestKill')m.max=Math.max(m.max??0,n);
     else m.sum+=n;
    }
    output.leaderCandidates.push({
     name:text(record.name),platform:record.platform,
     kills:numeric(values.kills),headshots:numeric(values.headshots),
     knocks:numeric(values.knocks),damage:numeric(values.damage),
     defeats:numeric(values.defeats),longestKill:numeric(values.longestKill)
    });
   }
  }
 }
 return Array.from(weapons.values()).map(weapon=>{
  const sources={};
  for(const source of SOURCES){
   const data=weapon.sources[source],metrics={};
   for(const metric of METRICS){
    const v=data.metrics[metric];
    metrics[metric]={value:v.count?(metric==='longestKill'?v.max:v.sum):null,
      observed:v.count};
   }
   const leaders=data.leaderCandidates.filter(p=>p.kills!==null)
     .sort((a,b)=>b.kills-a.kills ||
       (b.damage??-1)-(a.damage??-1) ||
       a.name.localeCompare(b.name)||a.platform.localeCompare(b.platform))
     .slice(0,5);
   sources[source]={players:data.players,metrics,leaders};
  }
  return{name:weapon.name,playersWithRecord:weapon.playersWithRecord,sources};
 }).sort((a,b)=>
  (b.sources.official.metrics.kills.value??-1)-
  (a.sources.official.metrics.kills.value??-1)||
  b.playersWithRecord-a.playersWithRecord||a.name.localeCompare(b.name))
  .slice(0,120);
}
async function publicClanWeaponBoard(db){
 const members=await read(db.from('player_import_queue')
  .select('gamertag,is_clan_member,status').eq('is_clan_member',true)
  .eq('status','matched').limit(1000));
 const names=new Set(members.filter(x=>x?.is_clan_member===true&&
  x.status==='matched'&&text(x.gamertag).trim())
  .map(x=>text(x.gamertag).trim().toLowerCase()));
 const players=await read(db.from('players')
  .select('gamertag,platform,pubg_account_id').limit(1000));
 const used=new Set(),confirmed=[];
 for(const player of players){
  if(!names.has(text(player?.gamertag).trim().toLowerCase())||
    !['xbox','psn'].includes(player.platform)||
    !validAccount(player.pubg_account_id)||
    used.has(player.platform+':'+player.pubg_account_id))continue;
  used.add(player.platform+':'+player.pubg_account_id);
  confirmed.push({name:text(player.gamertag),platform:player.platform,
   key:'pubg:v1:'+player.platform+'/players/'+player.pubg_account_id+'/weapon_mastery'});
  if(confirmed.length>=MAX_PLAYERS)break;
 }
 const saved=new Map(),CHUNK=40;
 for(let i=0;i<confirmed.length;i+=CHUNK){
  const keys=confirmed.slice(i,i+CHUNK).map(p=>p.key);
  const entries=await read(db.from('pubg_endpoint_cache')
   .select('cache_key,payload,fetched_at').in('cache_key',keys).limit(keys.length));
  for(const entry of entries)
   if(keys.includes(entry?.cache_key))saved.set(entry.cache_key,entry);
 }
 const observations=[],timestamps=[];
 let cachedMasteryPlayers=0;
 for(const player of confirmed){
  const cache=saved.get(player.key);
  const values=cache?.payload?.data?.attributes?.weaponSummaries;
  if(!values||typeof values!=='object'||Array.isArray(values))continue;
  cachedMasteryPlayers++;
  if(typeof cache.fetched_at==='string'&&
    Number.isFinite(Date.parse(cache.fetched_at)))timestamps.push(cache.fetched_at);
  if(weaponItems(cache.payload).length)observations.push({
   name:player.name,platform:player.platform,payload:cache.payload
  });
 }
 const weapons=aggregateWeaponRecords(observations);
 return{status:200,body:{
  schemaVersion:1,kind:'clan-weapons',verifiedMembers:names.size,
  resolvedConsoleAccounts:confirmed.length,cachedMasteryPlayers,
  contributingPlayers:observations.length,
  oldestSavedAt:timestamps.length?timestamps.sort()[0]:null,
  newestSavedAt:timestamps.length?timestamps[timestamps.length-1]:null,
  sources:SOURCES,weapons,
  note:'Cached mastery for verified clan console accounts only. Different players may have different last-refresh dates. Official and Competitive are separate post-18.2 records; legacy totals stopped updating at 18.2. Each metric has its own observed-player count; missing values never become zeros. This is neither all clan games nor a global weapon ranking. No PUBG requests were made.'
 }};
}
module.exports={publicClanWeaponBoard,aggregateWeaponRecords,METRICS,SOURCES,MAX_PLAYERS};
