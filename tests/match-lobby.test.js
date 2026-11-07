'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {shapeLobby,publicMatchLobby,safePlayer,number}=require('../lib/web-match-lobby');
const {sortedTeams,visibleRows,csvTeams,csvCell}=require('../assets/match-lobby');
const MATCH='00336e4b-d659-4497-bfc4-9f6dd705cc71';
const ACCOUNT='account.TESTPLAYER01';
const player=(id,name,account,kills,damage,placement)=>({
 type:'participant',id,attributes:{stats:{
 name,playerId:account,kills,damageDealt:damage,winPlace:placement,
 assists:1,DBNOs:0,headshotKills:0,timeSurvived:800,deathType:'byplayer',
 secretAPIKey:'PRIVATE_SECRET'
 }}});
const record={
 data:{id:MATCH,attributes:{
  mapName:'Baltic_Main',gameMode:'squad',matchType:'official',
  createdAt:'2026-11-07T10:00:00Z',duration:1900,token:'PRIVATE_TOKEN'
 }},
 included:[
  player('p1','Our Hero',ACCOUNT,7,645.3,2),
  player('p2','Friendly','account.TEAMMATE',3,130.5,2),
  player('p3','Opponent','account.RIVAL1234',12,1200,1),
  player('p4','account.hidden','account.HIDDEN',null,null,null),
  {type:'roster',id:'roster-one',attributes:{stats:{rank:2,teamId:42}},
   relationships:{participants:{data:[{id:'p1'},{id:'p2'}]}}},
  {type:'roster',id:'roster-two',attributes:{stats:{rank:1,teamId:90}},
   relationships:{participants:{data:[{id:'p3'}]}}},
  {type:'asset',attributes:{URL:'https://telemetry-cdn.pubg.com/private.json'}},
  {type:'secret',token:'LEAK'}
 ]};
function db({missing=false,mismatch=false,playerKnown=true,archive=null,
  archivedPlayedAt='2026-11-07T10:00:00Z'}={}){
 const calls=[];
 return{calls,from(table){calls.push(table);return{
  select(){return this;},ilike(){return this;},eq(){return this;},
  gte(){return this;},
  limit:async()=>({error:null,data:playerKnown?[{
   gamertag:'Our Hero',platform:'xbox',pubg_account_id:ACCOUNT
  }]:[]}),
  maybeSingle:async()=>({error:null,data:
   table==='pubg_endpoint_cache'?missing?null:{
    payload:mismatch?{...record,included:record.included.slice(2)}:record,
    fetched_at:'2026-11-07T12:00:00Z'
   }:
   table==='pubg_match_lobby_archive'&&archive?{
    compact_match:archive,source_fetched_at:'2026-11-07T12:00:00Z',
    archived_at:'2026-11-07T15:00:00Z',played_at:archivedPlayedAt
   }:null})
 };}};
}

test('official lobby shapes rosters, team rank and player stats from the source',()=>{
 const response=shapeLobby(record,ACCOUNT,MATCH,'2026-11-07T12:00:00Z');
 assert.equal(response.schemaVersion,1);
 assert.equal(response.kind,'match-lobby');
 assert.equal(response.teamsShown,3,'unassigned player must not be grouped into an invented squad');
 assert.equal(response.playersShown,4);
 assert.equal(response.teams[0].placement,1);
 assert.equal(response.teams[0].players[0].name,'Opponent');
 const team=response.teams.find(x=>x.isOwnTeam);
 assert.equal(team.placement,2);
 assert.equal(team.assignedRoster,true);
 assert.equal(team.players.length,2);
 assert.equal(team.kills.value,10);
 assert.equal(team.kills.observed,2);
 assert.equal(team.damage.value,775.8);
 assert.equal(team.players[0].isSelf,true);
 assert.equal(team.players[1].isSelf,false);
 assert.equal(response.teams.at(-1).placement,null);
 assert.equal(response.teams.at(-1).players[0].name,'Unnamed participant');
 assert.equal(response.teams.at(-1).kills.value,null);
 assert.equal(response.teams.at(-1).kills.observed,0);
 assert.equal(response.ownTeamPosition,2);
 assert.doesNotMatch(JSON.stringify(response),
  /account\.|PRIVATE|telemetry-cdn|teamId|roster-one|playerId|secretAPIKey/);
});
test('absent and invalid participant values stay missing rather than zero',()=>{
 const missing={type:'participant',id:'x',attributes:{stats:{
  name:'Unit',kills:null,damageDealt:'bad',headshotKills:0,
  winPlace:0,timeSurvived:-1,deathType:'secret',weaponsAcquired:'3'
 }}};
 const r=safePlayer(missing,'another');
 assert.equal(r.kills,null);
 assert.equal(r.damage,null);
 assert.equal(r.headshots,0);
 assert.equal(r.placement,null);
 assert.equal(r.timeSurvivedSeconds,null);
 assert.equal(r.weaponsAcquired,3);
 assert.equal(r.deathType,null);
 assert.equal(number(true),null);
 assert.equal(number(' '),null);
});
test('verified console participant can inspect saved lobby with no extra budget or upstream calls',async()=>{
 const client=db();
 const r=await publicMatchLobby(client,{name:'Our Hero',match:MATCH});
 assert.equal(r.status,200);
 assert.equal(r.body.player,'Our Hero');
 assert.equal(r.body.teams.length,3);
 assert.equal(r.body.archived,false);
 assert.deepEqual(client.calls,['players','pubg_endpoint_cache']);
 assert.doesNotMatch(JSON.stringify(r.body),/pubg_account_id|account\.|PRIVATE/);
});
test('missing match or participant gives honest unavailable rather than fabricated lobby',async()=>{
 const absent=await publicMatchLobby(db({missing:true}),{name:'Our Hero',match:MATCH});
 assert.equal(absent.status,404);
 assert.match(absent.body.error,/180-day personal archive/);
 const mismatch=await publicMatchLobby(db({mismatch:true}),{name:'Our Hero',match:MATCH});
 assert.equal(mismatch.status,404);
 const unknown=await publicMatchLobby(db({playerKnown:false}),{name:'Our Hero',match:MATCH});
 assert.equal(unknown.status,404);
 assert.equal(shapeLobby({...record,data:{id:'not-the-request'}},ACCOUNT,MATCH),null);
});
test('invalid multi-player name and match UUID are rejected before Supabase reads',async()=>{
 for(const args of [
  {name:'',match:MATCH},{name:'A,B',match:MATCH},
  {name:'Foo\nBar',match:MATCH},{name:'x'.repeat(101),match:MATCH},
  {name:'Our Hero',match:'not-a-uuid'},
  {name:'Our Hero',match:[MATCH]}
 ]){
  const client=db(),r=await publicMatchLobby(client,args);
  assert.equal(r.status,400);
  assert.deepEqual(client.calls,[]);
 }
});
test('frontend filters real squad members and does not alter observed team values',()=>{
 const r=shapeLobby(record,ACCOUNT,MATCH,'2026-11-07T12:00:00Z');
 const sorted=sortedTeams(r.teams,'kills');
 assert.equal(sorted[0].players[0].name,'Opponent');
 assert.equal(sorted[1].kills.value,10);
 const mine=visibleRows(r,'',true,'placement');
 assert.equal(mine.length,1);
 assert.equal(mine[0].isOwnTeam,true);
 assert.equal(visibleRows(r,'Friendly',false,'placement').length,1);
 assert.equal(visibleRows(r,'Absent',false,'placement').length,0);
 const csv=csvTeams(r);
 assert.match(csv,/Our Hero/);
 assert.match(csv,/Unnamed participant/);
 assert.doesNotMatch(csv,/PRIVATE|account\.|roster-one/);
 assert.equal(csvCell('=HYPERLINK("bad")'),`"'=HYPERLINK(""bad"")"`);
 assert.equal(csvCell('  +1'),`"'  +1"`);
});
test('both dashboard entry points load the same optional match lobby',()=>{
 const root=path.resolve(__dirname,'..'),read=p=>
  fs.readFileSync(path.join(root,p),'utf8');
 for(const p of ['index.html','training/index.html']){
  const html=read(p);
  for(const id of ['lobby-panel','lobby-match','lobby-load','lobby-sort',
   'lobby-search','lobby-team-scope','lobby-team-table','lobby-player-table',
   'lobby-export','lobby-count'])
   assert.match(html,new RegExp('id="'+id+'"'),p+' missing '+id);
  assert.match(html,/\/assets\/match-lobby\.css/);
 }
 assert.match(read('index.html'),/\/assets\/match-lobby\.js/);
 assert.match(read('training/js/clan-dashboard-loader.js'),/\/assets\/match-lobby\.js/);
 assert.match(read('assets/site.js'),/MatchLobby\?\.matchesChanged/);
 assert.match(read('assets/site.js'),/MatchLobby\?\.init/);
 assert.match(read('assets/match-lab.js'),/data-lobby-match/);
 assert.match(read('api/public-matches.js'),/publicMatchLobby/);
 assert.match(read('package.json'),/node --check lib\/web-match-lobby\.js/);
 assert.doesNotMatch(read('assets/match-lobby.js'),/SUPABASE_SERVICE_KEY|PUBG_API_KEY|DISCORD_BOT_TOKEN/);
});

test('older legitimate saved match falls back to 180-day sanitized full-lobby source',async()=>{
 const dbClient=db({missing:true,archive:record});
 const reply=await publicMatchLobby(dbClient,{name:'Our Hero',match:MATCH});
 assert.equal(reply.status,200);
 assert.equal(reply.body.archived,true);
 assert.match(reply.body.source,/180-day/);
 assert.equal(reply.body.teamsShown,3);
 assert.equal(reply.body.teams.find(t=>t.isOwnTeam).players.length,2);
 assert.equal(reply.body.archivedAt,'2026-11-07T15:00:00Z');
 assert.deepEqual(dbClient.calls,['players','pubg_endpoint_cache',
  'pubg_match_lobby_archive']);
 assert.doesNotMatch(JSON.stringify(reply.body),
  /account\.|PRIVATE|telemetry-cdn|teamId|roster-one|playerId|secretAPIKey/);
});
test('cached report wins over archived duplicates and does not read archive',async()=>{
 const dbClient=db({archive:record});
 const reply=await publicMatchLobby(dbClient,{name:'Our Hero',match:MATCH});
 assert.equal(reply.status,200);
 assert.equal(reply.body.archived,false);
 assert.deepEqual(dbClient.calls,['players','pubg_endpoint_cache']);
});
test('an archived match without proof of the selected PUBG account is never shown',async()=>{
 const outsider={...record,included:record.included.slice(2)};
 const dbClient=db({missing:true,archive:outsider});
 const reply=await publicMatchLobby(dbClient,{name:'Our Hero',match:MATCH});
 assert.equal(reply.status,404);
 assert.deepEqual(dbClient.calls,['players','pubg_endpoint_cache',
  'pubg_match_lobby_archive']);
});
test('archive query enforces actual 180-day match age and exact match-id equality',async()=>{
 const filters=[];
 const client=db({missing:true,archive:record});
 const original=client.from;
 client.from=function(table){
  const q=original.call(this,table);
  const eq=q.eq,gte=q.gte;
  q.eq=function(field,value){filters.push([table,field,value]);return eq.call(this,field,value);};
  q.gte=function(field,value){filters.push([table,field,value]);return gte.call(this,field,value);};
  return q;
 };
 const reply=await publicMatchLobby(client,{name:'Our Hero',match:MATCH});
 assert.equal(reply.status,200);
 assert.deepEqual(filters.filter(x=>x[0]==='pubg_match_lobby_archive')
  .map(x=>x[1]),['match_id','played_at']);
 assert.equal(filters.find(x=>x[1]==='match_id')[2],MATCH);
 const cutoff=Date.parse(filters.find(x=>x[1]==='played_at')[2]);
 assert.ok(Math.abs(cutoff-(Date.now()-180*86400_000))<60000);
});
test('retained 180-day full lobby migration is private and source-allowlisted',()=>{
 const sql=fs.readFileSync(path.join(__dirname,
  '../supabase/migrations/20261107_compact_official_match_lobby_retention.sql'),'utf8');
 assert.match(sql,/create table if not exists public\.pubg_match_lobby_archive/);
 assert.match(sql,/enable row level security/);
 assert.match(sql,/revoke all on table public\.pubg_match_lobby_archive/);
 assert.match(sql,/grant select,insert,update,delete.*to service_role/s);
 assert.match(sql,/security invoker/);
 assert.match(sql,/archive_verified_clan_match\(new\.payload\)/);
 assert.match(sql,/archive_saved_pubg_match_lobby\(new\.payload,new\.fetched_at\)/);
 assert.match(sql,/source_fetched_at/);
 assert.match(sql,/public\.players p/);
 assert.match(sql,/p\.pubg_account_id/);
 assert.match(sql,/interval '180 days'/);
 assert.match(sql,/jsonb_build_object\(\s*'type','participant'/);
 assert.match(sql,/jsonb_build_object\(\s*'type','roster'/);
 assert.match(sql,/prune_pubg_match_lobby_archive/);
 assert.doesNotMatch(sql,/('URL'|'token'|'telemetryUrl'|'secretAPIKey')\s*,/);
 const sync=fs.readFileSync(path.join(__dirname,'../api/sync.js'),'utf8');
 assert.match(sync,/db\.rpc\('prune_pubg_match_lobby_archive'\)/);
 assert.doesNotMatch(sync,/matchLobbyArchive.*fetch\(/s);
});
