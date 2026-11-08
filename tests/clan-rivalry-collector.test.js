'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {officialAccounts,deriveKillReports,collectOne,collectClanRivalries,MAX_MATCHES}=
 require('../lib/clan-rivalry-collector');
const UUID='5dd845f3-8a3d-44a0-a2b1-8fc5e957b722';
const A='account.AAAAAAAABBBB',B='account.BBBBBBBBCCCC',X='account.OUTSIDER7777';
const NOW=Date.parse('2026-11-08T12:00:00Z'),PLAYED='2026-11-07T18:00:00Z';
const event=(killer,victim,kind='LogPlayerKillV2',extra={})=>({
 _T:kind,killer,victim,...extra
});
const p=(id,name,teamId)=>({accountId:id,name,teamId});
const members=[
 {pubg_account_id:A,platform:'xbox',status:'matched',is_clan_member:true},
 {pubg_account_id:B,platform:'psn',status:'matched',is_clan_member:true}
];
const match={data:{id:UUID,attributes:{createdAt:PLAYED,mapName:'Baltic_Main',
 gameMode:'squad'}},included:[
 {type:'participant',attributes:{stats:{playerId:A}}},
 {type:'participant',attributes:{stats:{playerId:B}}},
 {type:'participant',attributes:{stats:{playerId:X}}},
 {type:'asset',attributes:{URL:'https://telemetry-cdn.pubg.com/test.json'}}
]};
const events=[
 event(p(A,'Alpha',1),p(X,'Rival',3)),
 event(p(X,'Rival',3),p(A,'Alpha',1)),
 event(p(B,'Bravo',2),p(X,'Rival',3),'LogPlayerKill'),
 event(p(A,'Alpha',1),p(B,'Bravo',1)), // same team in this event
 event(p(A,'Alpha',1),p(A,'Alpha',1)),
 event(p(X,'Rival',3),p(B,'Bravo',2),'LogPlayerKillV2',{isSuicide:true}),
 event(null,p(A,'Alpha',1)), // zone death
 event(p(X,'Rival',3),p(B,'Bravo',2),'LogPlayerTakeDamage')
];
test('one match derives actual directed kills for each verified clan player',()=>{
 const reports=deriveKillReports(events,members,{matchId:UUID,playedAt:PLAYED,
  map:'Baltic_Main',mode:'squad'});
 assert.equal(reports.length,2);
 const alpha=reports.find(x=>x.accountId===A).payload;
 const bravo=reports.find(x=>x.accountId===B).payload;
 assert.equal(alpha.rivals.length,1);
 assert.equal(alpha.rivals[0].name,'Rival');
 assert.equal(alpha.rivals[0].kills,1);
 assert.equal(alpha.rivals[0].deaths,1);
 assert.equal(bravo.rivals[0].kills,1);
 assert.equal(bravo.rivals[0].deaths,0);
 assert.equal(bravo.rivals[0].damageDealt,null);
 assert.equal(reports.every(x=>x.payload.rivals.every(v=>!Object.hasOwn(v,'accountId'))),true);
 assert.doesNotMatch(JSON.stringify(reports.map(r=>r.payload)),/account\.|telemetry-cdn|location|track|replay/);
});
test('clan verification requires exact match participant and current membership',()=>{
 assert.deepEqual(officialAccounts(match,[
  ...members,{pubg_account_id:X,platform:'xbox',status:'matched',is_clan_member:false},
  {pubg_account_id:'account.NEVER',platform:'xbox',status:'matched',is_clan_member:true}
 ]).map(x=>x.pubg_account_id),[A,B]);
 assert.equal(officialAccounts(match,[{...members[0],status:'pending'}]).length,0);
 assert.equal(officialAccounts(match,[{...members[0],is_clan_member:false}]).length,0);
 assert.equal(MAX_MATCHES,2);
});
function database({payload=match,queue=members,existing=[]}={}){
 const writes=[],scope=[],calls=[];
 const dataFor=(table,kind,fields,filters,input)=>{
  if(table==='pubg_endpoint_cache'&&kind==='single'){
   return{payload};
  }
  if(table==='player_import_queue')return queue;
  if(table==='pubg_endpoint_cache'&&kind==='many')return existing;
  if(table==='pubg_endpoint_cache'&&kind==='upsert')return[{cache_key:input.cache_key}];
  if(table==='web_refresh_guard'&&kind==='update')return[{scope:'done'}];
  throw Error('Unexpected DB query '+table+':'+kind);
 };
 return{writes,scope,calls,
  from(table){
   calls.push(table);
   const q={fields:null,filters:{},input:null,kind:null,
    select(fields){this.fields=fields;
     if(this.kind==='upsert'||this.kind==='update')
      return Promise.resolve({data:dataFor(table,this.kind,fields,this.filters,this.input),error:null});
     return this;},
    eq(k,v){this.filters[k]=v;return this;},
    in(k,v){this.filters[k]=v;return this;},
    limit(){return this;},
    maybeSingle(){return Promise.resolve({data:dataFor(table,'single',this.fields,this.filters),error:null});},
    upsert(obj){this.kind='upsert';this.input=obj;writes.push(obj);return this;},
    update(obj){this.kind='update';this.input=obj;scope.push(obj);return this;},
    then(resolve,reject){
     const kind=table==='player_import_queue'?'members':'many';
     return Promise.resolve({data:dataFor(table,kind,this.fields,this.filters),error:null}).then(resolve,reject);
    }
   };
   return q;
  },
  rpc(name,params){
   if(name!=='claim_clan_kill_rivalry_matches')throw Error('No external RPC');
   assert.ok(params.p_limit<=2);
   return Promise.resolve({data:[{match_id:UUID,lease_at:'2026-11-08T12:00:00Z'}],error:null});
  }
 };
}
test('background collector consumes one publisher telemetry asset for two clan members',async()=>{
 const db=database(),hits=[];
 const result=await collectClanRivalries(db,{
  now:NOW,fetcher:async()=>{throw Error('Fetcher should be passed to parser')},
  parseTelemetry:async(fetcher,url)=>{hits.push(url);return events}
 });
 assert.equal(result.status,'processed');
 assert.equal(result.claimed,1);
 assert.equal(result.matchesSaved,1);
 assert.equal(result.playersSaved,2);
 assert.equal(hits.length,1);
 assert.equal(db.writes.length,2);
 assert.equal(db.scope.length,1);
 assert.ok(db.writes.every(x=>x.cache_key.startsWith('web:kill-rivalry:v1:'+UUID+':')));
 assert.ok(db.writes.every(x=>Date.parse(x.expires_at)>NOW));
 assert.equal(db.calls.includes('player_import_queue'),true);
});
test('already saved exact-match rivalry rows skip fetch and preserve manual analysis',async()=>{
 const existing=members.map(m=>({
  cache_key:'web:kill-rivalry:v1:'+UUID+':'+m.pubg_account_id,
  expires_at:'2027-01-01T00:00:00Z',
  payload:{schemaVersion:1,matchId:UUID}
 }));
 const db=database({existing});
 const r=await collectOne(db,{match_id:UUID,lease_at:'2026-11-08T12:00:00Z'},{
  now:NOW,parseTelemetry:async()=>{throw Error('Must not download again')}});
 assert.equal(r.status,'already_saved');
 assert.equal(r.reused,2);
 assert.equal(db.writes.length,0);
});
test('missing or malicious source does not contact the publisher',async()=>{
 const bad=structuredClone(match);
 bad.included[3].attributes.URL='https://evil.example.test/collect';
 const db=database({payload:bad});
 const r=await collectOne(db,{match_id:UUID,lease_at:'2026-11-08T12:00:00Z'},{
  now:NOW,parseTelemetry:async()=>{throw Error('Must not download')}});
 assert.equal(r.status,'source_missing');
 assert.equal(db.writes.length,0);
});
test('automatic collector wiring is restricted to existing authenticated jobs',()=>{
 const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
 const sql=read('supabase/migrations/20261108_automatic_verified_clan_kill_rivalry_claims.sql');
 assert.match(sql,/pg_advisory_xact_lock/);
 assert.match(sql,/security invoker/i);
 assert.match(sql,/revoke all on function public.claim_clan_kill_rivalry_matches/i);
 assert.match(sql,/grant execute on function public.claim_clan_kill_rivalry_matches\(integer\)\s+to service_role/i);
 assert.match(sql,/q.is_clan_member=true/);
 const sync=read('api/sync.js');
 assert.match(sync,/verifyGitHubBackfillToken/);
 assert.match(sync,/collectClanRivalries\(db\)/);
 const runner=read('scripts/collect-pubg-backfill.js');
 assert.match(runner,/rivalry.claimed===0/);
 assert.doesNotMatch(read('lib/clan-rivalry-collector.js'),/PUBG_API_KEY|requestAnimationFrame|LogPlayerPosition|web:telemetry:v1:/);
});
