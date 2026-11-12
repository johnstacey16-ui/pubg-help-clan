'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {collectClanSeasons,currentId,MAX_PLAYERS}=require('../lib/clan-season-sync');
const result=data=>({data,error:null});
function fakeDb(queue){
 const calls=[],outcomes=[];
 return{
  calls,outcomes,
  rpc:async name=>{calls.push(name);assert.equal(name,'claim_clan_season_sync');
    return result(queue.length?[queue.shift()]:[]);},
  from(table){
    assert.equal(table,'clan_season_sync_state');
    return{
      update(p){outcomes.push(p);return this;},
      eq(){return this;},
      select(){return Promise.resolve(result([{player_id:11}]));}
    };
  }
 };
}
const player=(n=11,platform='xbox')=>({
 player_id:n,gamertag:'Console'+n,platform,pubg_account_id:'account.'+n+'123456789'
});
const season={data:[{id:'division.bro.official.console-43',attributes:{
  isCurrentSeason:true,isOffseason:false}}]};
const withKey=async fn=>{
 const old=process.env.PUBG_API_KEY;
 process.env.PUBG_API_KEY='unit-test';
 try{return await fn()}finally{
   if(old===undefined)delete process.env.PUBG_API_KEY;
   else process.env.PUBG_API_KEY=old;
 }
};
test('only genuine current season IDs are accepted',()=>{
 assert.equal(currentId(season),'division.bro.official.console-43');
 assert.equal(currentId({data:[{id:'unsafe/id',attributes:{isCurrentSeason:true}}]}),null);
 assert.equal(currentId({data:[]}),null);
});
test('collects three verified players with one index request per shard',()=>withKey(async()=>{
 const db=fakeDb([player(),player(12),player(13)]),indexes=[],calls=[];
 const status=await collectClanSeasons(db,{
  cachedEndpoint:async(_db,shard,path,ttl,opts)=>{
    indexes.push({shard,path,ttl,force:opts.force});return{state:'fresh',data:season};
  },
  playerEndpoint:async(_db,p,path,ttl,opts)=>{
    calls.push({p,path,force:opts.force});return{state:'fresh',data:{data:{}}};
  }
 });
 assert.equal(status.playersAttempted,MAX_PLAYERS);
 assert.equal(status.seasonSaved,3);
 assert.equal(status.rankedSaved,3);
 assert.equal(indexes.length,1);
 assert.equal(calls.length,6);
 assert.ok(calls.every(x=>x.force));
 assert.ok(indexes.every(x=>x.force));
 assert.ok(db.outcomes.every(x=>x.last_result==='saved'));
 const nextDelay=db.outcomes.map(x=>Date.parse(x.next_attempt_at)-Date.now());
 assert.ok(nextDelay.every(ms=>ms>11.9*3600*1000 && ms<12.1*3600*1000),
   'successful players should be due on the next twice-daily backfill');
}));
test('atomic limit refusal stops before claiming another member',()=>withKey(async()=>{
 const db=fakeDb([player(),player(12)]);
 const status=await collectClanSeasons(db,{
  cachedEndpoint:async()=>({state:'rate_limited'}),
  playerEndpoint:async()=>{throw Error('Unexpected player request')}
 });
 assert.equal(status.status,'rate_limited');
 assert.equal(status.playersAttempted,1);
 assert.equal(db.calls.length,1);
 assert.equal(db.outcomes[0].last_result,'rate_limited');
 assert.ok(Date.parse(db.outcomes[0].next_attempt_at)-Date.now() < 90*1000);
 assert.ok(Date.parse(db.outcomes[0].next_attempt_at)>Date.now());
}));
test('a stale current-season index never triggers player requests',()=>withKey(async()=>{
 const db=fakeDb([player()]);
 let playerCalls=0;
 const status=await collectClanSeasons(db,{
  cachedEndpoint:async()=>({state:'stale',data:season}),
  playerEndpoint:async()=>{playerCalls++;return{state:'stale',data:{data:{}}};}
 });
 assert.equal(status.seasonSaved,0);
 assert.equal(status.rankedSaved,0);
 assert.equal(status.unavailable,1);
 assert.equal(playerCalls,0);
 assert.equal(db.outcomes[0].last_result,'season_index_unavailable');
}));
test('missing API key avoids all database claims',async()=>{
 const db=fakeDb([player()]),old=process.env.PUBG_API_KEY;
 delete process.env.PUBG_API_KEY;
 try{
  const status=await collectClanSeasons(db);
  assert.equal(status.status,'not_configured');
  assert.equal(db.calls.length,0);
 }finally{
  if(old===undefined)delete process.env.PUBG_API_KEY;
  else process.env.PUBG_API_KEY=old;
 }
});

test('public health exposes collection status without PUBG account IDs',()=>{
 const fs=require('node:fs');const path=require('node:path');
 const code=fs.readFileSync(path.join(__dirname,'../api/health.js'),'utf8');
 assert.match(code,/clan_season_sync_state/);
 assert.match(code,/players_attempted:/);
 assert.match(code,/last_finished_at:/);
 assert.doesNotMatch(code,/select\('.*pubg_account_id/);
});
