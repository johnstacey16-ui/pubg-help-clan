'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {publicSource,safeSource}=require('../lib/web-source');
const person={gamertag:'ConsolePlayer',platform:'xbox',pubg_account_id:'account.public1234'};
function db(cache,players=[person]){
 return{from(table){
  if(table==='players')return{select(){return this;},ilike(){return this;},limit:async()=>({data:players,error:null})};
  assert.equal(table,'pubg_endpoint_cache');
  return{select(){return this;},eq(key,value){this.key=value;return this;},
   async maybeSingle(){return{data:cache[this.key]||null,error:null}}};
 }};
}
test('source strips identifiers and publisher telemetry addresses, retains null and zeros',async()=>{
 const out=safeSource({score:0,missing:null,accountId:'account.secret',
  participants:[{playerId:'account.secret',kills:0,url:'https://telemetry-cdn.pubg.com/anything'}]});
 assert.deepEqual(out,{score:0,missing:null,participants:[{kills:0}]});
});
test('actual saved weapon mastery can be explored without upstream requests',async()=>{
 const cache={'pubg:v1:xbox/players/account.public1234/weapon_mastery':{
  fetched_at:'2026-11-03T13:00:00Z',
  payload:{data:{id:'account.public1234',attributes:{
    weaponSummaries:{weaponX:{LevelCurrent:5,StatsTotal:{Kills:0,DamagePlayer:4}}}
  }}}
 }};
 const x=await publicSource(db(cache),{name:'ConsolePlayer',kind:'weapons'});
 assert.equal(x.status,200);
 assert.equal(x.body.payload.weaponSummaries.weaponX.StatsTotal.Kills,0);
 assert.doesNotMatch(JSON.stringify(x.body),/account.public1234/);
 assert.equal(x.body.fetchedAt,'2026-11-03T13:00:00Z');
});
test('saved match source requires this exact player among actual participants',async()=>{
 const match='b6b122cc-1224-1333-9999-deadbeef1224';
 const cache={['pubg:v1:console/matches/'+match]:{payload:{data:{attributes:{mapName:'Erangel_Main'}},
  included:[{type:'participant',attributes:{stats:{playerId:'different',kills:12}}}]}}};
 const wrong=await publicSource(db(cache),{name:'ConsolePlayer',kind:'match',match});
 assert.equal(wrong.status,404);
 cache['pubg:v1:console/matches/'+match].payload.included[0].attributes.stats.playerId=person.pubg_account_id;
 const good=await publicSource(db(cache),{name:'ConsolePlayer',kind:'match',match});
 assert.equal(good.status,200);
 assert.equal(good.body.payload.participants[0].stats.kills,12);
 assert.doesNotMatch(JSON.stringify(good.body),/account.public1234/);
});
test('source explorer requires a console for duplicate saved names',async()=>{
 const psn={...person,platform:'psn',pubg_account_id:'account.psn1234567'};
 const cache={'pubg:v1:psn/players/account.psn1234567/weapon_mastery':{
  fetched_at:'2026-11-04T13:00:00Z',payload:{data:{attributes:{sourcePlatform:'psn'}}}
 }};
 const database=db(cache,[person,psn]);
 const ambiguous=await publicSource(database,{name:'ConsolePlayer',kind:'weapons'});
 assert.equal(ambiguous.status,409);
 assert.equal(ambiguous.body.code,'platform_ambiguous');
 assert.deepEqual(ambiguous.body.choices,['xbox','psn']);
 assert.doesNotMatch(JSON.stringify(ambiguous.body),/account\.psn1234567/);
 const selected=await publicSource(database,{name:'ConsolePlayer',kind:'weapons',platform:'psn'});
 assert.equal(selected.status,200);
 assert.equal(selected.body.platform,'psn');
 assert.equal(selected.body.payload.sourcePlatform,'psn');
});

test('invalid selectors cannot query the database',async()=>{
 const bad=await publicSource({from(){throw Error('should not query')}},{name:'x',kind:'match',match:'bad'});
 assert.equal(bad.status,400);
});
