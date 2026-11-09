'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const intel=require('../lib/commands-intel');
const {commands,VERSION}=require('../lib/command-definitions');
const UUIDS=Array.from({length:25},(_,i)=>
 '00000000-0000-4000-8000-'+String(i+1).padStart(12,'0'));
const PLAYER={id:17,gamertag:'Sample Member',platform:'xbox',pubg_account_id:'account.12345678'};
const stamp=i=>new Date(Date.UTC(2026,10,30-i)).toISOString();
const body=(name,opts=[])=>({data:{name,options:opts}});
const opt=(name,value)=>({name,value});
function archive(count=20){
 return Array.from({length:count},(_,i)=>({
  match_id:UUIDS[i],played_at:stamp(i),recorded_at:stamp(i),
  summary:{id:UUIDS[i],map:'Baltic_Main',mode:'squad',
   placement:i<10?1:15,kills:i<10?5:2,damage:i<10?420:100}
 }));
}
function savedMatchDb(records){
 const tables=[];
 return{tables,from(table){
  tables.push(table);
  if(table==='players')return{
   select(){return this;},ilike(){return this;},
   limit(){return Promise.resolve({data:[PLAYER],error:null});}
  };
  if(table==='clan_match_archive')return{
   select(){return this;},eq(){return this;},order(){return this;},
   limit(){return Promise.resolve({data:records,error:null});}
  };
  throw Error('Unexpected private read '+table);
 }};
}
test('/form reuses exactly the saved 10+10 window and never fetches PUBG',async()=>{
 const db=savedMatchDb(archive());
 const result=await intel.form(db,body('form',[opt('gamertag',PLAYER.gamertag)]));
 assert.match(result,/Recent Form: Sample Member/);
 assert.match(result,/Improving/);
 assert.match(result,/10\/10 latest · 10\/10 previous/);
 assert.match(result,/Kills \/ game.*5 vs 2/);
 assert.match(result,/Damage \/ game.*420 vs 100/);
 assert.match(result,/Top-10 finishes/);
 assert.match(result,/saved match archive/i);
 assert.match(result,/\/dashboard\/#matches\/player\/Sample%20Member\/form/);
 assert.ok(result.length<1900);
 assert.deepEqual(db.tables,['players','clan_match_archive'],
  'Discord form must query only existing saved tables');
});
test('/form protects incomplete samples without making missing games into losses',async()=>{
 const db=savedMatchDb(archive(12));
 const result=await intel.form(db,body('form',[opt('gamertag',PLAYER.gamertag)]));
 assert.match(result,/Not enough history/);
 assert.match(result,/10\/10 latest · 2\/10 previous/);
 assert.match(result,/incomplete sample/);
 assert.doesNotMatch(result,/Improving|Declining/);
 assert.deepEqual(db.tables,['players','clan_match_archive']);
});
test('/form missing official values do not get treated as zeros or score changes',async()=>{
 const records=archive();
 records[0].summary.kills=null;
 records[11].summary.damage=null;
 const result=await intel.form(savedMatchDb(records),
  body('form',[opt('gamertag',PLAYER.gamertag)]));
 assert.match(result,/Incomplete stats/);
 assert.match(result,/incomplete sample/);
 assert.doesNotMatch(result,/Improving|Declining/);
});
function rivalryDb(report){
 const tables=[];
 return {tables,from(table){
  tables.push(table);
  if(table==='players')return{
   select(){return this;},ilike(){return this;},
   limit(){return Promise.resolve({data:[PLAYER],error:null});}
  };
  if(table==='pubg_endpoint_cache')return{
   query:null,select(){return this;},like(_col,pattern){this.query=pattern;return this;},
   order(){return this;},
   limit(){return Promise.resolve({data:this.query.startsWith('web:kill-rivalry:')?[report]:[],error:null});}
  };
  throw Error('Unexpected data source: '+table);
 }};
}
test('/rivals reports real directed kill events from stored compact analyses only',async()=>{
 const now=Date.now(),id=UUIDS[0];
 const row={
  cache_key:'web:kill-rivalry:v1:'+id+':'+PLAYER.pubg_account_id,
  fetched_at:new Date(now).toISOString(),
  expires_at:new Date(now+30*86400_000).toISOString(),
  payload:{schemaVersion:1,matchId:id,playedAt:new Date(now-3600_000).toISOString(),
   matchMap:'Baltic_Main',mode:'squad',
   rivals:[{name:'Opponent One',kills:2,deaths:1},
    {name:'Opponent Two',kills:0,deaths:3}]}
 };
 const db=rivalryDb(row);
 const report=await intel.rivals(db,body('rivals',[
  opt('gamertag',PLAYER.gamertag),opt('days',30)
 ]));
 assert.match(report,/Recorded Kill Rivalries: Sample Member/);
 assert.match(report,/Last 30 days/);
 assert.match(report,/You killed most.*Opponent One.*2 confirmed kill/);
 assert.match(report,/Killed you most.*Opponent Two.*3 confirmed kill/);
 assert.match(report,/previously analysed matches/);
 assert.match(report,/\/dashboard\/#matches\/player\/Sample%20Member\/rivals/);
 assert.deepEqual(db.tables,['players','pubg_endpoint_cache','pubg_endpoint_cache']);
 assert.ok(report.length<1900);
});
test('/rivals with an invalid date rejects before reading data',async()=>{
 const db={from(){throw Error('Invalid date must not query Supabase');}};
 const r=await intel.rivals(db,body('rivals',[opt('gamertag','Example'),opt('days',29)]));
 assert.match(r,/Choose 7, 30, 180/);
});
function boardRow(name,games,kills,wins){
 return{name,platform:'xbox',map:'Baltic_Main',mode:'squad',games,
  placed:games,wins,top10:wins,killsObserved:games,kills,
  damageObserved:games,damage:kills*100,assistsObserved:games,assists:0,
  knocksObserved:games,knocks:0,survivalObserved:games,
  survivalSeconds:3000,placementTotal:games*10,latest:stamp(1)};
}
test('/clanmatches combines observed player groups but uses distinct clan matches from source',async()=>{
 const called=[];
 const db={rpc(name,args){
  called.push({name,args});
  return Promise.resolve({data:{
   schemaVersion:1,periodDays:30,clanPlayers:55,observedPlayers:2,
   playerMatchObservations:5,distinctMatches:3,
   rows:[boardRow('Player A',2,5,1),boardRow('Player A',1,2,0),
    boardRow('Player B',2,3,0)]
  },error:null});
 }};
 const output=await intel.clanMatches(db,body('clanmatches',[opt('days',30)]));
 assert.match(output,/Verified Clan Match History · 30 days/);
 assert.match(output,/3.*distinct archived matches/);
 assert.match(output,/5.*player-match observations/);
 assert.match(output,/2 \/ 55/);
 assert.match(output,/Player A.*3 game.*7 kills/);
 assert.ok(!/PUBG API refresh/.test(output));
 assert.deepEqual(called,[{name:'get_clan_match_history_board',args:{p_days:30}}]);
});
test('/intel gives useful deep links and no database or PUBG operations',()=>{
 const db={from(){throw Error('Should not read DB');},rpc(){throw Error('Should not call DB');}};
 const scout=intel.intel(db,body('intel',[opt('section','scout')]));
 assert.match(scout,/Opponent Scouting/);
 assert.match(scout,/dashboard\/#matches/);
 assert.match(scout,/no PUBG API calls/i);
 const stats=intel.intel(db,body('intel',[opt('section','stats')]));
 assert.match(stats,/#full-stats/);
 assert.match(intel.intel(db,body('intel',[opt('section','health')])) ,/#health/);
 assert.match(intel.intel(db,body('intel',[opt('section','unknown')])) ,/valid intelligence section/);
});
test('new registered slash options remain bounded and preserve existing commands',()=>{
 assert.equal(commands.length,21);
 assert.match(VERSION,/v8-saved-intel/);
 for(const name of ['form','rivals','clanmatches','intel']){
  const item=commands.find(c=>c.name===name);
  assert.ok(item,name+' must be registered');
  assert.equal(item.type,1);
 }
 assert.deepEqual(commands.find(c=>c.name==='rivals').options[1].choices.map(x=>x.value),
  [0,7,30,180]);
 assert.deepEqual(commands.find(c=>c.name==='clanmatches').options[0].choices.map(x=>x.value),
  [7,30,180]);
 assert.ok(commands.find(c=>c.name==='clanmanage'),
  'must retain restricted clan roster management');
});
