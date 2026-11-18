'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {publicInsights}=require('../lib/web-insights');
const {cachedPlayerMatches}=require('../lib/web-match-intel');
const {publicMatchLobby}=require('../lib/web-match-lobby');
const {publicLobbyOpponents}=require('../lib/web-lobby-opponents');
const {publicTelemetry,publicRivalTrends}=require('../lib/web-telemetry');
const match='00336e4b-d659-4497-bfc4-9f6dd705cc71';
const people=[
 {id:41,gamertag:'MirrorName',platform:'xbox',pubg_account_id:'account.XBOXPLAYERSRC11'},
 {id:42,gamertag:'MirrorName',platform:'psn',pubg_account_id:'account.PSNPLAYERSRC222'}
];
function db(){
 const calls=[];
 return {calls,from(table){
  calls.push({table});
  return {
   select(){return this},eq(){return this},ilike(){return this},
   gte(){return this},like(){return this},in(){return this},order(){return this},
   async limit(){return{data:table==='players'?people:[],error:null}},
   async maybeSingle(){return{data:null,error:null}}
  };
 }};
}
const routes=[
 ['weapons',database=>publicInsights(database,{name:'MirrorName',kind:'weapons'})],
 ['teammates',database=>publicInsights(database,{name:'MirrorName',kind:'teammates'})],
 ['survival',database=>publicInsights(database,{name:'MirrorName',kind:'survival'})],
 ['matches',database=>cachedPlayerMatches(database,'MirrorName')],
 ['lobby',database=>publicMatchLobby(database,{name:'MirrorName',match})],
 ['scouting',database=>publicLobbyOpponents(database,{name:'MirrorName',days:'7'})],
 ['telemetry',database=>publicTelemetry(database,{name:'MirrorName',match})],
 ['rivals',database=>publicRivalTrends(database,{name:'MirrorName',days:'7'})]
];
for(const [kind,action] of routes){
 test(kind+' refuses ambiguous names without private lookups',async()=>{
  const database=db(),result=await action(database);
  assert.equal(result.status,409,kind);
  assert.equal(result.body.code,'platform_ambiguous');
  assert.deepEqual(result.body.choices,['xbox','psn']);
  assert.deepEqual(database.calls,[{table:'players'}]);
  assert.doesNotMatch(JSON.stringify(result.body),/account\.|pubg_account_id|player_id/);
 });
}
test('explicit PSN and Xbox choose their own data paths',async()=>{
 const p=await cachedPlayerMatches(db(),'MirrorName','psn');
 assert.equal(p.status,200);assert.equal(p.body.platform,'psn');
 const x=await publicInsights(db(),{name:'MirrorName',platform:'xbox',kind:'weapons'});
 assert.equal(x.status,200);assert.equal(x.body.platform,'xbox');
 const ps=await publicInsights(db(),{name:'MirrorName',platform:'psn',kind:'teammates'});
 assert.equal(ps.status,200);assert.equal(ps.body.platform,'psn');
 const missing=await publicMatchLobby(db(),{name:'MirrorName',platform:'psn',match});
 assert.equal(missing.status,404); // Source not saved: do not invent it.
});
test('unrecognised console rejects early without database access',async()=>{
 const actions=[
  d=>publicInsights(d,{name:'MirrorName',kind:'weapons',platform:'steam'}),
  d=>cachedPlayerMatches(d,'MirrorName','steam'),
  d=>publicMatchLobby(d,{name:'MirrorName',match,platform:'steam'}),
  d=>publicLobbyOpponents(d,{name:'MirrorName',platform:'steam'}),
  d=>publicTelemetry(d,{name:'MirrorName',match,platform:'steam'}),
  d=>publicRivalTrends(d,{name:'MirrorName',platform:'steam'})
 ];
 for(const fn of actions){const database=db(),r=await fn(database);
  assert.equal(r.status,400);assert.deepEqual(database.calls,[]);}
});
test('browser and handlers carry the selected platform through all supported views',()=>{
 const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
 for(const f of ['assets/site.js','assets/match-lobby.js','assets/lobby-opponents.js',
   'assets/personal-rivalries.js','assets/telemetry-view.js','assets/survival-view.js'])
   assert.match(read(f),/PubgSelectedPlatform/,f);
 assert.match(read('api/public-matches.js'),/cachedPlayerMatches\(db,name,platform\)/);
 assert.match(read('api/public-insights.js'),/publicInsights\(db,\{name,kind,platform:/);
});
