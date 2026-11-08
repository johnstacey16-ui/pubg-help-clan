'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {publicTelemetry,publicRivalTrends,shapeTelemetry,validTelemetryUrl}=require('../lib/web-telemetry');
const uuid='e7ff11aa-2222-3333-4444-555555555555';
const id='account.player123456789';
const other='account.other123456789';
const date=n=>new Date(Date.parse('2026-11-03T12:00:00Z')+n*1000).toISOString();
const events=[
 {_T:'LogPlayerPosition',_D:date(0),character:{accountId:id,name:'Hero',teamId:1,
  health:100,location:{x:1000,y:2000,z:0}}},
 {_T:'LogPlayerPosition',_D:date(60),character:{accountId:id,name:'Hero',teamId:1,
  health:95,location:{x:2000,y:3000,z:0}}},
 {_T:'LogGameStatePeriodic',_D:date(50),gameState:{
  safetyZonePosition:{x:3000,y:4000,z:0},safetyZoneRadius:500,
  numAlivePlayers:20}},
 {_T:'LogPlayerTakeDamage',_D:date(61),damage:45,
  damageCauserName:'WeapAK47_C',
  attacker:{accountId:id,name:'Hero',teamId:1},
  victim:{accountId:other,name:'Rival',teamId:2}},
 {_T:'LogPlayerKillV2',_D:date(63),killer:{accountId:id,name:'Hero',teamId:1},
  victim:{accountId:other,name:'Rival',teamId:2}},
 {_T:'LogPlayerKillV2',_D:date(65),killer:{accountId:id,name:'Hero',teamId:1},
  victim:{accountId:'account.friend',name:'Friend',teamId:1}},
 {_T:'LogPlayerRevive',_D:date(66),reviver:{accountId:id,name:'Hero',teamId:1},
  victim:{accountId:'account.friend',name:'Friend',teamId:1}}
];
function fakeDB(records,allowed=true){
 const calls={rpc:0,upsert:0};
 return{calls,
  from(table){
   if(table==='players')return{select(){return this;},ilike(){return this;},
    limit:async()=>({error:null,data:[{gamertag:'Hero',platform:'xbox',pubg_account_id:id}]})};
   assert.equal(table,'pubg_endpoint_cache');
   return{key:null,select(){if(this._write)return Promise.resolve({data:[],error:null});return this;},
    eq(k,v){this.key=v;return this;},
    maybeSingle:async function(){return{data:records[this.key]||null,error:null};},
    upsert:function(value){records[value.cache_key]=value;calls.upsert++;this._write=true;return this;}
   };
  },
  rpc:async(name,args)=>{assert.equal(name,'reserve_web_refresh');
   assert.match(args.p_player_key,/^xbox:telemetry:/);calls.rpc++;return{data:allowed,error:null};}
 };
}
function matchRecord(playerId=id,url='https://telemetry-cdn.pubg.com/blue/test.json'){
 return{payload:{data:{attributes:{mapName:'Erangel_Main',gameMode:'squad',
  createdAt:date(0)}},included:[
  {type:'participant',attributes:{stats:{playerId}}},
  {type:'asset',attributes:{URL:url}}
 ]}};
}
test('trusted telemetry URLs block localhost, credentials, redirects and subdomains',()=>{
 assert.equal(validTelemetryUrl('https://telemetry-cdn.pubg.com/test.json'),
  'https://telemetry-cdn.pubg.com/test.json');
 for(const url of [
  'http://telemetry-cdn.pubg.com/a','https://telemetry-cdn.pubg.com.evil.test/a',
  'https://127.0.0.1/a','https://user:pass@telemetry-cdn.pubg.com/a',
  'https://telemetry-cdn.pubg.com:8443/a','file:///tmp/x'
 ])assert.equal(validTelemetryUrl(url),null,url);
});
test('match telemetry captures real combat without position tracks or 2D replays',()=>{
 const shaped=shapeTelemetry(events,id,uuid,{mapName:'Erangel_Main',mode:'squad'});
 assert.equal(shaped.combatSummary.kills,1);
 assert.equal(shaped.combatSummary.revives,1);
 assert.equal(shaped.combatSummary.damageDealt,45);
 assert.equal(shaped.rivals[0].name,'Rival');
 assert.equal(shaped.rivals[0].kills,1);
 assert.equal(shaped.playerEvents.some(row=>row.type==='LogPlayerPosition'),false);
 assert.equal('replay' in shaped,false);
 assert.doesNotMatch(JSON.stringify(shaped),/account.player|account.other|"tracks"|"bounds"|"circles"|"samples"/);
});
test('a match without an actual saved participant cannot be queried',async()=>{
 const db=fakeDB({['pubg:v1:console/matches/'+uuid]:matchRecord('account.other')});
 const result=await publicTelemetry(db,{name:'Hero',match:uuid});
 assert.equal(result.status,404);
 assert.equal(db.calls.rpc,0);
});
test('shared web cooldown blocks CDN fetch and does not spend API budget',async()=>{
 const db=fakeDB({['pubg:v1:console/matches/'+uuid]:matchRecord()},false);
 let called=0;
 const r=await publicTelemetry(db,{name:'Hero',match:uuid},
  {fetcher:async()=>{called++;throw Error('not allowed');}});
 assert.equal(r.status,429);
 assert.equal(called,0);
 assert.equal(db.calls.rpc,1);
});
test('first trusted fetch stores bounded report; repeated fetch uses cache',async()=>{
 const records={['pubg:v1:console/matches/'+uuid]:matchRecord()},db=fakeDB(records);
 let hits=0;
 const fetcher=async()=>{hits++;return{ok:true,headers:{get(){return null;}},
  text:async()=>JSON.stringify(events)};};
 const first=await publicTelemetry(db,{name:'Hero',match:uuid},{fetcher});
 assert.equal(first.status,200);
 assert.equal(first.body.cache,'saved');
 assert.equal(first.body.combatSummary.kills,1);
 assert.equal(db.calls.upsert,2);
 assert.ok(records['web:kill-rivalry:v1:'+uuid+':'+id]);
 assert.equal(records['web:kill-rivalry:v1:'+uuid+':'+id].payload.rivals[0].kills,1);
 assert.ok(Date.parse(records['web:kill-rivalry:v1:'+uuid+':'+id].expires_at)>Date.now());
 const second=await publicTelemetry(db,{name:'Hero',match:uuid},{fetcher});
 assert.equal(second.status,200);
 assert.equal(second.body.cache,'saved');
 assert.equal(hits,1);
 assert.equal(db.calls.rpc,1);
});

test('legacy cached telemetry returns combat but discards old replay coordinates',async()=>{
 const key='web:telemetry:v1:'+uuid+':'+id;
 const legacy={schemaVersion:1,matchId:uuid,combatSummary:{kills:1},
  rivals:[{name:'Rival',kills:1}],playerEvents:[],
  replay:{tracks:[{name:'SHOULD_NOT_LEAK',samples:[{x:5,y:9}]}]}};
 const records={['pubg:v1:console/matches/'+uuid]:matchRecord(),
  [key]:{payload:legacy,fetched_at:date(0),
   expires_at:new Date(Date.now()+3600000).toISOString()}};
 const db=fakeDB(records);
 const report=await publicTelemetry(db,{name:'Hero',match:uuid},{fetcher:async()=>{
  throw Error('Legacy cache must not refetch');
 }});
 assert.equal(report.status,200);
 assert.equal(report.body.combatSummary.kills,1);
 assert.equal(report.body.replay,undefined);
 assert.doesNotMatch(JSON.stringify(report.body),/SHOULD_NOT_LEAK|"tracks"|"samples"/);
 assert.equal(db.calls.rpc,0);
});

test('expanded activity preserves source-relative event times without spatial playback',()=>{
 const records=[...events,
  {_T:'LogPlayerPosition',_D:date(67),character:{accountId:id,name:'Hero',
    location:{x:2000,y:3000,z:0}}},
  {_T:'LogItemPickup',_D:date(70),character:{accountId:id,name:'Hero'}}];
 const result=shapeTelemetry(records,id,uuid,{mapName:'Erangel_Main'});
 assert.equal(result.activityCoverage.observed,5);
 assert.equal(result.activityCoverage.returned,5);
 assert.equal(result.activityCoverage.truncated,false);
 assert.ok(result.playerEvents.some(e=>e.sourceIndex===8&&e.timeSeconds===70));
 assert.ok(result.playerEvents.every(e=>e.type!=='LogPlayerPosition'));
});
function trendDb(accountRecords,allPlayers=[{gamertag:'Hero',platform:'xbox',pubg_account_id:id}]){
 let upstream=0;
 return{get upstream(){return upstream;},
  from(table){
   if(table==='players')return{
    select(){return this;},ilike(){return this;},
    async limit(){return{data:allPlayers,error:null};}
   };
   if(table==='pubg_endpoint_cache')return{
    select(){return this;},like(col,pattern){
     assert.equal(col,'cache_key');
     assert.ok(pattern.startsWith('web:telemetry:v1:%:')||
      pattern.startsWith('web:kill-rivalry:v1:%:'));
     return this;
    },order(){return this;},
    async limit(){return{data:accountRecords,error:null};}
   };
   throw Error('Unexpected table '+table);
  },
  rpc(){upstream++;throw Error('Trend reads must not reserve API budgets');}
 };
}
test('cross-match rival trends deduplicate saved report IDs and use no upstream requests',async()=>{
 const two='e7ff11aa-2222-3333-4444-777777777777';
 const record=(match,arr)=>({
  cache_key:'web:telemetry:v1:'+match+':'+id,
  fetched_at:'2026-11-03T18:00:00Z',
  payload:{
   schemaVersion:1,matchId:match,playedAt:'2026-11-03T16:00:00Z',
   rivals:arr
  }
 });
 const db=trendDb([
  record(uuid,[{name:'Opponent',kills:1,deaths:0,damageDealt:60,damageTaken:12}]),
  record(uuid,[{name:'Opponent',kills:1,deaths:0,damageDealt:60,damageTaken:12}]),
  record(two,[{name:'opponent',kills:0,deaths:1,damageDealt:null,damageTaken:30}]),
  {cache_key:'web:telemetry:v1:'+two+':account.other1234',
   payload:{schemaVersion:1,matchId:two,rivals:[{name:'Bad',kills:99}]}}
 ]);
 const r=await publicRivalTrends(db,{name:'Hero'});
 assert.equal(r.status,200);
 assert.equal(r.body.matchesAnalysed,2);
 assert.equal(r.body.rivals.length,1);
 assert.equal(r.body.rivals[0].matchesSampled,2);
 assert.equal(r.body.rivals[0].kills,1);
 assert.equal(r.body.rivals[0].deaths,1);
 assert.equal(r.body.killLeaders.mostKilled.name,'Opponent');
 assert.equal(r.body.killLeaders.mostKilled.kills,1);
 assert.equal(r.body.killLeaders.mostKilledBy.name,'Opponent');
 assert.equal(r.body.killLeaders.mostKilledBy.deaths,1);
 assert.equal(r.body.rivals[0].damageDealt,60);
 assert.equal(r.body.rivals[0].damageTaken,42);
 assert.equal(db.upstream,0);
 assert.doesNotMatch(JSON.stringify(r.body),/account.other|account.player|Bad/);
});
test('rival name validation occurs before querying saved records',async()=>{
 const db={from(){throw Error('No DB on invalid name')}};
 assert.equal((await publicRivalTrends(db,{name:'A,B'})).status,400);
});
