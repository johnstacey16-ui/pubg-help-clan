'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {analyseSavedRivals,parseRivalFilters,visibleName,MAX_TIMELINE}
 =require('../lib/web-rival-intelligence');
const {publicRivalTrends}=require('../lib/web-telemetry');
const own='account.HERO1234567',bad='account.OUTSIDER999';
const ids=['e7ff11aa-2222-3333-4444-555555555555',
 'e7ff11aa-2222-3333-4444-777777777777',
 'e7ff11aa-2222-3333-4444-888888888888',
 'e7ff11aa-2222-3333-4444-999999999999'];
const row=(id,date,map,mode,rivals,owner=own)=>({
 cache_key:'web:telemetry:v1:'+id+':'+owner,
 fetched_at:'2026-11-07T11:00:00Z',
 payload:{schemaVersion:1,matchId:id,playedAt:date,
  matchMap:map,mode,rivals,token:'SECRET_DO_NOT_LEAK'}
});
const opponent=(name,kills,deaths,damageDealt,damageTaken)=>({
 name,kills,deaths,damageDealt,damageTaken,secret:'DO_NOT_LEAK'
});
const rows=[
 row(ids[0],'2026-10-15T13:00:00Z','Baltic_Main','squad',
  [opponent('Rival A',2,0,140,0)]),
 row(ids[1],'2026-11-04T13:00:00Z','Desert_Main','solo',
  [opponent('Rival A',0,1,null,30),opponent('Rival B',1,0,110,null)]),
 row(ids[2],'2026-11-06T13:00:00Z','Baltic_Main','squad',
  [opponent('rival a',1,1,75,50),opponent('Rival A',0,0,8,null),
   opponent('Unknown',0,0,0,0),opponent('account.private',4,0,200,0)]),
 row(ids[3],null,'Baltic_Main','duo',
  [opponent('Rival C',0,1,null,null)]),
 row(ids[1],'2026-11-04T13:00:00Z','Desert_Main','solo',
  [opponent('Duplicate',100,0,100000,0)]),
 row(ids[0],'2026-11-05T13:00:00Z','Baltic_Main','squad',
  [opponent('WrongAccount',100,0,100000,0)],bad),
 {cache_key:'malicious',payload:{schemaVersion:1,matchId:ids[2],
   rivals:[opponent('WrongKey',99,0,1000,0)]}}
];
test('source-bound grouping deduplicates match UUID and same-name opponents',()=>{
 const data=analyseSavedRivals(rows,own,{},'2026-11-08T00:00:00Z');
 assert.equal(data.schemaVersion,2);
 assert.equal(data.matchesScanned,4);
 assert.equal(data.matchesAnalysed,4);
 assert.equal(data.undatedMatches,1);
 assert.equal(data.opponentNames,3);
 assert.deepEqual(data.mapOptions,['Baltic_Main','Desert_Main']);
 assert.deepEqual(data.modeOptions,['duo','solo','squad']);
 const a=data.rivals.find(r=>r.name==='Rival A');
 assert.equal(a.matchesSampled,3);
 assert.equal(a.kills,3);
 assert.equal(a.deaths,2);
 assert.equal(a.damageDealt,223);
 assert.equal(a.damageTaken,80);
 assert.equal(a.damageDealtObserved,2);
 assert.equal(a.damageTakenObserved,3);
 assert.doesNotMatch(JSON.stringify(data),
  /SECRET_DO_NOT_LEAK|DO_NOT_LEAK|account.HERO|account.OUTSIDER|WrongAccount|WrongKey|account.private|Duplicate/);
 assert.match(data.note,/not verified cross-match account identities/i);
});
test('map, mode and genuine-date window filters use source timestamps only',()=>{
 const now='2026-11-08T00:00:00Z';
 const d=analyseSavedRivals(rows,own,{days:'7'},now);
 assert.equal(d.matchesAnalysed,2);
 assert.equal(d.undatedMatches,0);
 assert.equal(d.rivals.find(r=>r.name==='Rival A').matchesSampled,2);
 const m=analyseSavedRivals(rows,own,{map:'Baltic_Main',mode:'squad',days:7},now);
 assert.equal(m.matchesAnalysed,1);
 assert.equal(m.rivals[0].kills,1);
 assert.equal(m.rivals[0].damageDealt,83);
 const older=analyseSavedRivals(rows,own,{days:180,map:'Desert_Main'},now);
 assert.equal(older.matchesAnalysed,1);
 assert.equal(older.rivals.find(r=>r.name==='Rival B').kills,1);
 assert.equal(d.mapOptions.length,2,'Filters still offer maps from complete saved report set');
});
test('exact requested name receives bounded actual-match encounter timeline only',()=>{
 const d=analyseSavedRivals(rows,own,{opponent:'rival a'},'2026-11-08T00:00:00Z');
 assert.equal(d.selectedOpponent,'rival a');
 assert.equal(d.encountersAvailable,3);
 assert.equal(d.encountersReturned,3);
 assert.equal(d.encounters[0].playedAt,'2026-11-06T13:00:00.000Z');
 assert.equal(d.encounters[0].map,'Baltic_Main');
 assert.equal(d.encounters[0].damageDealt,83);
 assert.equal(d.encounters[1].damageDealt,null,'Unobserved per-match damage stays unavailable');
 assert.ok(d.encounters.every(e=>!Object.hasOwn(e,'matchId')));
 assert.equal(MAX_TIMELINE,30);
});
test('missing numeric fields stay unavailable; explicit zero is observed',()=>{
 const data=analyseSavedRivals([row(ids[0],null,'Map','squad',[
  opponent('Rival D',null,null,null,null),
  opponent('Rival E',0,0,0,0)
 ])],own,{opponent:'Rival D'});
 const empty=data.rivals.find(r=>r.name==='Rival D'),zero=data.rivals.find(r=>r.name==='Rival E');
 assert.equal(empty.kills,null);
 assert.equal(empty.damageDealt,null);
 assert.equal(empty.damageTakenObserved,0);
 assert.equal(zero.kills,0);
 assert.equal(zero.damageDealt,0);
 assert.equal(zero.damageDealtObserved,1);
 assert.equal(data.encounters[0].damageTaken,null);
});
test('invalid player filters and account-like opponent names are rejected',async()=>{
 for(const input of [
  {days:'3'}, {days:'30.0'}, {days:'NaN'}, {days:-1},
  {mode:'squad\nbad'}, {map:'x'.repeat(101)},
  {opponent:'account.PRIVATE'}, {opponent:'Unknown'},
  {opponent:'   '}
 ])assert.equal(parseRivalFilters(input),null,JSON.stringify(input));
 assert.equal(visibleName('account.private'),null);
 assert.equal(parseRivalFilters({days:30,mode:'solo'}).days,30);
 const db={from(){throw Error('No database access for invalid filters');}};
 assert.equal((await publicRivalTrends(db,{name:'Hero',days:'365'})).status,400);
 assert.equal((await publicRivalTrends(db,{name:'Hero,Other'})).status,400);
});
test('large saved report sets are bounded, deduplicated and never fetch PUBG',async()=>{
 let accessed=0;
 const db={
  from(table){
   accessed++;assert.ok(['players','pubg_endpoint_cache'].includes(table));
   if(table==='players')return{select(){return this;},ilike(){return this;},
    limit:async()=>({data:[{gamertag:'Hero',platform:'xbox',pubg_account_id:own}],error:null})};
   return{select(){return this;},like(){return this;},order(){return this;},
    limit:async()=>({data:rows,error:null})};
  },
  rpc(){throw Error('Rivals must use no budget RPC');}
 };
 const result=await publicRivalTrends(db,{name:'Hero',opponent:'Rival A'},
  {now:'2026-11-08T00:00:00Z'});
 assert.equal(result.status,200);
 assert.equal(accessed,2);
 assert.equal(result.body.player,'Hero');
 assert.equal(result.body.platform,'xbox');
 assert.equal(result.body.encounters.length,3);
 assert.doesNotMatch(JSON.stringify(result.body),/account.HERO|SECRET/);
});
