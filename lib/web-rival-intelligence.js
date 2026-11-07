'use strict';
// Cache-only opponent reporting from already analysed, account-verified PUBG
// telemetry. Names are visible labels, NOT cross-match account identities.
const UUID=/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const WINDOWS=new Set([0,7,30,180]);
const MAX_REPORTS=100,MAX_RIVALS=80,MAX_TIMELINE=30;
const safeNumber=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1e7?v:null;
function label(v){
 if(typeof v!=='string'||!v.trim()||v.length>100||
    /[\u0000-\u001f\u007f]/.test(v))return null;
 return v.trim();
}
function visibleName(v){
 const name=label(v);
 if(!name||name.length>90||/^account[._-]/i.test(name)||
   /^unknown$/i.test(name))return null;
 return name;
}
const timestamp=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))?
 new Date(v).toISOString():null;
function parseRivalFilters({days,map,mode,opponent}={}){
 const period=days===undefined||days===''?0:
   (typeof days==='number'&&WINDOWS.has(days)?days:
    typeof days==='string'&&/^(0|7|30|180)$/.test(days)?Number(days):null);
 if(period===null)return null;
 const values={map,mode,opponent};
 for(const [key,value] of Object.entries(values))
  if(value!==undefined&&value!==''&&
     (label(value)===null||(key==='opponent'&&visibleName(value)===null)))return null;
 return{days:period,map:label(map)||'',mode:label(mode)||'',
  opponent:visibleName(opponent)||''};
}
function total(){
 return{sum:0,observed:0};
}
function add(metric,v){
 const n=safeNumber(v);
 if(n===null)return;
 metric.sum+=n;metric.observed++;
}
const final=metric=>metric.observed?metric.sum:null;
function analyseSavedRivals(rows,accountId,filters={},clock=Date.now()){
 const opts=parseRivalFilters(filters);
 if(!opts)throw Error('Invalid rival filter');
 const suffix=':'+accountId,seen=new Set(),reports=[];
 let latestSavedAt=null;
 for(const row of Array.isArray(rows)?rows.slice(0,MAX_REPORTS):[]){
  const data=row?.payload,match=data?.matchId;
  if(!UUID.test(match||'')||
     row.cache_key!=='web:telemetry:v1:'+match+suffix||
     data.schemaVersion!==1||seen.has(match))continue;
  seen.add(match);
  if(!latestSavedAt)latestSavedAt=timestamp(row.fetched_at);
  reports.push({data,
   map:label(data.matchMap)||'Unknown map',
   mode:label(data.mode)||'Unknown mode',
   playedAt:timestamp(data.playedAt),
   savedAt:timestamp(row.fetched_at)});
 }
 const maps=[...new Set(reports.map(r=>r.map))].sort((a,b)=>a.localeCompare(b)).slice(0,60);
 const modes=[...new Set(reports.map(r=>r.mode))].sort((a,b)=>a.localeCompare(b)).slice(0,30);
 const now=typeof clock==='number'?clock:Date.parse(clock);
 const since=opts.days?now-opts.days*86400000:null;
 const selected=reports.filter(r=>
  (!opts.map||r.map===opts.map)&&(!opts.mode||r.mode===opts.mode)&&
  (since===null||(r.playedAt!==null&&
    Date.parse(r.playedAt)>=since&&Date.parse(r.playedAt)<=now)));
 const rivals=new Map(),observations=[];
 for(const report of selected){
  // Within a match, one visible name could label multiple telemetry accounts.
  // Aggregate their events but count this match only once for that name.
  const perName=new Map();
  for(const entry of Array.isArray(report.data.rivals)?report.data.rivals.slice(0,60):[]){
   const name=visibleName(entry?.name);
   if(!name)continue;
   const key=name.toLowerCase();
   let opponent=perName.get(key);
   if(!opponent){
    opponent={name,metrics:Object.fromEntries(
     ['kills','deaths','damageDealt','damageTaken'].map(k=>[k,total()]))};
    perName.set(key,opponent);
   }
   for(const k of Object.keys(opponent.metrics))add(opponent.metrics[k],entry[k]);
  }
  for(const [key,opponent] of perName){
   if(!rivals.has(key))rivals.set(key,{
    name:opponent.name,matchesSampled:0,
    kills:total(),deaths:total(),damageDealt:total(),damageTaken:total(),
    lastMatchAt:null
   });
   const r=rivals.get(key);
   r.matchesSampled++;
   for(const k of ['kills','deaths','damageDealt','damageTaken']){
    const m=opponent.metrics[k];
    if(m.observed){r[k].sum+=m.sum;r[k].observed++;}
   }
   if(report.playedAt&&(!r.lastMatchAt||report.playedAt>r.lastMatchAt))
    r.lastMatchAt=report.playedAt;
   if(opts.opponent.toLowerCase()===key){
    observations.push({
     map:report.map,mode:report.mode,playedAt:report.playedAt,
     kills:final(opponent.metrics.kills),deaths:final(opponent.metrics.deaths),
     damageDealt:final(opponent.metrics.damageDealt),
     damageTaken:final(opponent.metrics.damageTaken)
    });
   }
  }
 }
 const list=[...rivals.values()].sort((a,b)=>
  ((final(b.kills)||0)+(final(b.deaths)||0))-
  ((final(a.kills)||0)+(final(a.deaths)||0))||
  b.matchesSampled-a.matchesSampled||
  a.name.localeCompare(b.name)).slice(0,MAX_RIVALS).map(r=>({
   name:r.name,matchesSampled:r.matchesSampled,
   kills:final(r.kills),deaths:final(r.deaths),
   killsObserved:r.kills.observed,deathsObserved:r.deaths.observed,
   damageDealt:final(r.damageDealt),damageTaken:final(r.damageTaken),
   damageDealtObserved:r.damageDealt.observed,
   damageTakenObserved:r.damageTaken.observed,
   lastMatchAt:r.lastMatchAt
  }));
 observations.sort((a,b)=>
  (Date.parse(b.playedAt||'')||0)-(Date.parse(a.playedAt||'')||0));
 return{
  schemaVersion:2,matchesScanned:reports.length,matchesAnalysed:selected.length,
  undatedMatches:selected.filter(r=>!r.playedAt).length,
  opponentNames:rivals.size,latestSavedAt,
  filterDays:opts.days,filterMap:opts.map,filterMode:opts.mode,
  selectedOpponent:opts.opponent||null,
  mapOptions:maps,modeOptions:modes,
  rivals:list,encountersReturned:Math.min(observations.length,MAX_TIMELINE),
  encountersAvailable:observations.length,
  encounters:observations.slice(0,MAX_TIMELINE),
  note:'Only previously analysed PUBG telemetry events are counted. Visible names are not verified cross-match account identities. Each unique saved match counts at most once per visible name, but same-name accounts may be combined. A missing value is not zero. Filters never infer unrecorded fights or missing match history. No new PUBG or telemetry fetches.'
 };
}
module.exports={analyseSavedRivals,parseRivalFilters,visibleName,safeNumber,MAX_REPORTS,MAX_RIVALS,MAX_TIMELINE};
