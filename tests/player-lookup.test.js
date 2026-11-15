'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {publicPlayer,validInput}=require('../lib/web-player');
const {processLookup,sameOrigin}=require('../api/player-lookup');
function db({existing=true,platform='xbox',clan=false,playerRows=null}={}){
 const calls=[],source={
  players:playerRows??(existing?[{id:12,gamertag:'Outsider',platform,
    total_kills:120,total_wins:7,matches_played:55,last_checked:'2026-01-01T00:00:00Z'}]:[]),
  player_lifetime_details:{game_mode_stats:{solo:{kills:120,wins:7,roundsPlayed:55,headshotKills:60}}},
  player_import_queue:[{gamertag:'Outsider',status:'matched',platform,is_clan_member:clan}]
 };
 return{calls,from(t){calls.push(t);return{
   select(){return this},ilike(){return this},eq(){return this},
   async limit(){return{data:source[t]||[],error:null}},
   async maybeSingle(){return{data:source[t],error:null}}
 }},async rpc(name,args){calls.push(name);return{data:false,error:null}}};
}
test('non-clan tracked player is available as a complete public profile',async()=>{
 const result=await publicPlayer(db(),'Outsider','xbox');
 assert.equal(result.status,200);
 assert.equal(result.body.found,true);
 assert.equal(result.body.isClanMember,false);
 assert.equal(result.body.player.kills,120);
 assert.equal(result.body.player.advanced.headshots,60);
 assert.doesNotMatch(JSON.stringify(result.body),/player_id|pubg_account_id|"id":12/);
});
test('unknown person can search before requesting first PUBG refresh',async()=>{
 const r=await publicPlayer(db({existing:false}),'Outsider','psn');
 assert.equal(r.status,200);
 assert.equal(r.body.found,false);
});
test('same gamertag across consoles never overwrites another account',async()=>{
 const r=await publicPlayer(db(),'Outsider','psn');
 assert.equal(r.status,409);
 assert.match(r.body.error,/already saved on/);
});
test('auto-selection rejects two saved console accounts without spending the refresh budget',async()=>{
 const same={gamertag:'Outsider',total_wins:2,matches_played:10,last_checked:'2026-01-01T00:00:00Z'};
 const database=db({playerRows:[
   {...same,id:12,platform:'xbox',total_kills:40},
   {...same,id:13,platform:'psn',total_kills:90}
 ]});
 const auto=await processLookup(database,{name:'Outsider',platform:'auto',refresh:true});
 assert.equal(auto.status,409);
 assert.equal(auto.body.code,'platform_ambiguous');
 assert.deepEqual(auto.body.choices,['xbox','psn']);
 assert.deepEqual(database.calls,['players']);
 const selected=await publicPlayer(database,'Outsider','psn');
 assert.equal(selected.status,200);
 assert.equal(selected.body.platform,'psn');
 assert.equal(selected.body.player.kills,90);
});

test('recent refresh message reflects the actual two-minute cache guard',async()=>{
 const database=db({playerRows:[{
   id:12,gamertag:'Outsider',platform:'xbox',
   total_kills:12,total_wins:1,matches_played:3,last_checked:new Date().toISOString()
 }]});
 const result=await processLookup(database,{name:'Outsider',platform:'auto',refresh:true});
 assert.equal(result.status,200);
 assert.equal(result.body.refreshState,'recent');
 assert.match(result.body.note,/2 minutes/);
 assert.equal(database.calls.includes('reserve_web_refresh'),false);
});

test('refresh requests are separately throttled before PUBG API access',async()=>{
 const f=db(),r=await processLookup(f,{name:'Outsider',platform:'xbox',refresh:true});
 assert.equal(r.status,429);
 assert.deepEqual(f.calls.slice(-1),['reserve_web_refresh']);
});
test('web refresh requires matching HTTPS origin and valid console selection',()=>{
 assert.equal(sameOrigin({headers:{host:'pubg-clan-bot.vercel.app',origin:'https://pubg-clan-bot.vercel.app'}}),true);
 assert.equal(sameOrigin({headers:{host:'pubg-help-clan.vercel.app',origin:'https://pubg-help-clan.vercel.app'}}),true);
 assert.equal(sameOrigin({headers:{host:'pubg-help-clan.vercel.app',origin:'https://pubg-clan-bot.vercel.app'}}),false);
 assert.equal(sameOrigin({headers:{host:'evil.vercel.app',origin:'https://evil.vercel.app'}}),false);
 assert.equal(sameOrigin({headers:{host:'pubg-clan-bot.vercel.app',origin:'https://evil.example'}}),false);
 assert.equal(validInput('Random Player','psn'),true);
 assert.equal(validInput('Random, Other','psn'),false);
 assert.equal(validInput('Player','steam'),false);
 assert.equal(validInput('Player','auto'),true);
 assert.equal(validInput('Player'),true);
});

test('auto-detect loads previously saved console without requiring a platform choice',async()=>{
 const database=db({platform:'psn',clan:false});
 const result=await publicPlayer(database,'Outsider','auto');
 assert.equal(result.status,200);
 assert.equal(result.body.found,true);
 assert.equal(result.body.platform,'psn');
 assert.equal(result.body.isClanMember,false);
 assert.deepEqual(database.calls,['players','player_lifetime_details','player_import_queue']);
});
test('auto-detect accepts an unknown name without creating duplicate player records',async()=>{
 const database=db({existing:false});
 const result=await publicPlayer(database,'Outsider','auto');
 assert.equal(result.status,200);
 assert.equal(result.body.found,false);
 assert.equal(result.body.platform,'auto');
 assert.deepEqual(database.calls,['players']);
});
test('auto-detect refresh uses confirmed platform as cooldown key',async()=>{
 const database=db({platform:'psn'});
 const result=await processLookup(database,{name:'Outsider',platform:'auto',refresh:true});
 assert.equal(result.status,429);
 assert.deepEqual(database.calls.slice(-1),['reserve_web_refresh']);
});
test('a saved console mismatch returns the known platform without overwriting',async()=>{
 const result=await publicPlayer(db({platform:'psn'}),'Outsider','xbox');
 assert.equal(result.status,409);
 assert.equal(result.body.suggestedPlatform,'psn');
});

test('auto-detected official clan player remains identified as a member',async()=>{
 const database=db({platform:'xbox',clan:true});
 const r=await publicPlayer(database,'Outsider','auto');
 assert.equal(r.status,200);
 assert.equal(r.body.platform,'xbox');
 assert.equal(r.body.isClanMember,true);
});
test('explicit platform and auto-detection agree on official clan membership',async()=>{
 const database=db({platform:'psn',clan:true});
 const auto=await publicPlayer(database,'Outsider','auto');
 const selected=await publicPlayer(database,'Outsider','psn');
 assert.equal(auto.body.isClanMember,true);
 assert.equal(selected.body.isClanMember,true);
});
