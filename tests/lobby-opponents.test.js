'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {publicLobbyOpponents,summarizeLobbies,parseFilters,MAX_MATCHES,MAX_NAMES}=require('../lib/web-lobby-opponents');
const {csvRows,visibleRows,csvCell}=require('../assets/lobby-opponents');
const ACCOUNT='account.HERO1234567',NOW=Date.parse('2026-11-08T12:00:00Z');
const A='00336e4b-d659-4497-bfc4-9f6dd705cc71',B='00336e4b-d659-4497-bfc4-9f6dd705cc72';
function participant(id,name,account,kills,damage,place){
 return{type:'participant',id,attributes:{stats:{name,playerId:account,kills,
  damageDealt:damage,winPlace:place,DBNOs:0,headshotKills:0,secretAPIKey:'NOT_PUBLIC'}}};
}
function roster(id,rank,refs){
 return{type:'roster',id,attributes:{stats:{rank,teamId:99}},
  relationships:{participants:{data:refs.map(id=>({id}))}}};
}
function row(id,playedAt,{first=false,unassignedSelf=false}={}){
 const included=[
  participant('self','Our Hero',ACCOUNT,7,900,2),
  participant('friend','Friend','account.FRIEND000',2,100,2),
  participant('enemy1',first?'Rival':'rival','account.RIVAL0000',first?5:3,first?450:null,1),
  participant('enemy2',first?'RIVAL':'Another','account.ENEMY0000',first?2:1,first?110:50,3),
  participant('ghost','Ghost','account.GHOST0000',1,10,10),
  ...(!unassignedSelf?[roster('ours',2,['self','friend'])]:[]),
  roster('theirs1',1,['enemy1']),roster('theirs2',3,['enemy2']),
  {type:'asset',attributes:{URL:'https://telemetry-cdn.pubg.com/PRIVATE.json'}}
 ];
 return{match_id:id,played_at:playedAt,
  source_fetched_at:'2026-11-08T06:00:00Z',
  compact_match:{data:{id,attributes:{mapName:first?'Baltic_Main':'Desert_Main',
   gameMode:first?'squad':'duo',createdAt:playedAt,duration:1500,
   secret:'NOT_PUBLIC'}},included}};
}
const records=[
 row(A,'2026-11-06T10:00:00Z',{first:true}),
 row(B,'2026-10-25T08:00:00Z')
];
function client({archived=records,validPlayer=true}={}){
 const calls=[];
 return{calls,rpc(){throw Error('No API budget or upstream request allowed');},
  from(table){
   calls.push(table);
   if(table==='players')return{
    select(){return this;},ilike(){return this;},
    async limit(){return{error:null,data:validPlayer?[{
     id:12,gamertag:'Our Hero',platform:'xbox',pubg_account_id:ACCOUNT
    }]:[]};}
   };
   if(table==='clan_match_archive')return{
    select(){return this;},eq(){return this;},
    gte(){return this;},order(){return this;},
    async limit(){return{error:null,data:archived.map(r=>({
      match_id:r.match_id,played_at:r.played_at
    }))};}
   };
   if(table==='pubg_match_lobby_archive')return{
    ids:[],since:null,select(){return this;},
    in(field,ids){assert.equal(field,'match_id');this.ids=ids;return this;},
    gte(field,since){assert.equal(field,'played_at');this.since=since;return this;},
    async limit(){return{error:null,data:archived.filter(r=>
     this.ids.includes(r.match_id)&&Date.parse(r.played_at)>=Date.parse(this.since))};}
   };
   throw Error('Unexpected table '+table);
  }
 };
}
test('verified saved lobby rosters distinguish real opponents from missing team membership',()=>{
 const r=summarizeLobbies([...records,row(
  '00336e4b-d659-4497-bfc4-9f6dd705cc73','2026-11-07T10:00:00Z',
  {unassignedSelf:true})],ACCOUNT,{days:30},NOW);
 assert.equal(r.kind,'lobby-opponent-scout');
 assert.equal(r.lobbyReportsVerified,3);
 assert.equal(r.lobbyReportsClassified,2);
 assert.equal(r.matchesIncluded,2);
 assert.equal(r.opponentAppearances,4);
 assert.equal(r.opponentNames,2);
 const rival=r.opponents.find(x=>x.name.toLowerCase()==='rival');
 assert.equal(rival.matchesObserved,2);
 assert.equal(rival.participantAppearances,3);
 assert.equal(rival.nameCollisionMatches,1);
 assert.equal(rival.kills,10);
 assert.equal(rival.killsObserved,3);
 assert.equal(rival.damage,560);
 assert.equal(rival.damageObserved,2);
 assert.equal(rival.bestPlacement,1);
 assert.ok(!r.opponents.some(x=>x.name==='Ghost'));
 assert.doesNotMatch(JSON.stringify(r),/account\.[A-Za-z0-9]|secretAPIKey|NOT_PUBLIC|telemetry-cdn|PRIVATE|"tracks"|"replay"|"URL"/);
});
test('source window, map, mode and sorts never fabricate missing game stats',()=>{
 const recent=summarizeLobbies(records,ACCOUNT,{days:'7'},NOW);
 assert.equal(recent.matchesIncluded,1);
 assert.equal(recent.opponentAppearances,2);
 const desert=summarizeLobbies(records,ACCOUNT,{days:30,map:'Desert_Main',mode:'duo'},NOW);
 assert.equal(desert.matchesIncluded,1);
 assert.equal(desert.opponents.find(x=>x.name.toLowerCase()==='rival').kills,3);
 assert.deepEqual(desert.mapOptions,['Baltic_Main','Desert_Main']);
 const absent=summarizeLobbies(records,ACCOUNT,{days:30,mode:'solo'},NOW);
 assert.equal(absent.matchesIncluded,0);
 assert.deepEqual(absent.opponents,[]);
 assert.equal(summarizeLobbies(records,ACCOUNT,{days:30,sort:'damage'},NOW).opponents[0].name,'Rival');
 assert.equal(MAX_MATCHES,75);
 assert.equal(MAX_NAMES,80);
});
test('per-opponent drilldown reports genuine full-match totals, not head-to-head claims',()=>{
 const r=summarizeLobbies(records,ACCOUNT,{days:30,opponent:'Rival'},NOW);
 assert.equal(r.kind,'lobby-opponent-detail');
 assert.equal(r.observationsAvailable,3);
 assert.equal(r.observations.length,3);
 assert.ok(r.observations.every(x=>x.matchId===A||x.matchId===B));
 assert.equal(r.observations[0].opponentKills,5);
 assert.equal(r.observations[0].playerKills,7);
 assert.equal(r.observations[2].opponentDamage,null);
 assert.doesNotMatch(JSON.stringify(r),/account\.[A-Za-z0-9]|NOT_PUBLIC|telemetry-cdn|secretAPIKey|"replay"/);
});
test('invalid name and selectors are rejected before using private database',async()=>{
 for(const args of [
  {name:'Our Hero',days:'4'},{name:'Our Hero',map:'bad,filter'},
  {name:'Our Hero',sort:'__proto__'},{name:'Our Hero',opponent:' not trimmed'},
  {name:'Our Hero',opponent:['Rival']},{name:'Bad,Name'},{name:'Bad\nName'},{name:''}
 ]){
  const db=client(),r=await publicLobbyOpponents(db,args,{now:NOW});
  assert.equal(r.status,400,JSON.stringify(args));
  assert.deepEqual(db.calls,[]);
 }
 assert.equal(parseFilters({days:500}),null);
});
test('verified console account and actual 180-day saved match join do not spend PUBG budget',async()=>{
 const db=client();
 const r=await publicLobbyOpponents(db,{name:'Our Hero',days:'30'},{now:NOW});
 assert.equal(r.status,200);
 assert.equal(r.body.kind,'lobby-opponent-scout');
 assert.equal(r.body.platform,'xbox');
 assert.equal(r.body.savedMatchesScanned,2);
 assert.equal(r.body.fullLobbiesFound,2);
 assert.deepEqual(db.calls,['players','clan_match_archive','pubg_match_lobby_archive']);
 assert.doesNotMatch(JSON.stringify(r.body),/pubg_account_id|account\.[A-Za-z0-9]|NOT_PUBLIC|telemetry-cdn/);
 assert.equal((await publicLobbyOpponents(client({validPlayer:false}),{name:'Our Hero'},{now:NOW})).status,404);
 const none=await publicLobbyOpponents(client({archived:[]}),{name:'Our Hero'},{now:NOW});
 assert.equal(none.status,200);
 assert.equal(none.body.opponents.length,0);
 assert.equal(none.body.savedMatchesScanned,0);
});
test('CSV cells block formulas and browser filtering never expands source grouping',()=>{
 assert.match(csvCell('=HYPERLINK("bad")'),/^"'=/);
 assert.match(csvCell('  +1'),/^"'  \+1/);
 const list=summarizeLobbies(records,ACCOUNT,{days:30},NOW);
 assert.equal(visibleRows(list,'RIVAL').length,1);
 const csv=csvRows(visibleRows(list,'Rival'));
 assert.match(csv,/Rival/);
 assert.doesNotMatch(csv,/Another|account\.|NOT_PUBLIC/);
});
test('both integrated routes ship the scouting source, never a replay',()=>{
 const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
 for(const p of ['index.html','training/index.html']){
  const html=read(p);
  for(const id of ['scout-panel','scout-days','scout-load','scout-search',
   'scout-map','scout-mode','scout-order','scout-summary',
   'scout-count','scout-table','scout-detail','scout-export'])
   assert.match(html,new RegExp('id="'+id+'"'),p+' missing '+id);
  assert.match(html,/\/assets\/lobby-opponents\.css/);
 }
 assert.match(read('index.html'),/\/assets\/lobby-opponents\.js/);
 assert.match(read('training/js/clan-dashboard-loader.js'),/\/assets\/lobby-opponents\.js/);
 assert.match(read('assets/site.js'),/LobbyOpponents\?\.matchesChanged/);
 assert.match(read('assets/site.js'),/LobbyOpponents\?\.init/);
 assert.match(read('api/public-matches.js'),/route==='opponents'/);
 assert.match(read('api/public-matches.js'),/publicLobbyOpponents/);
 assert.match(read('package.json'),/node --check lib\/web-lobby-opponents\.js/);
 assert.doesNotMatch(read('assets/lobby-opponents.js')+read('lib/web-lobby-opponents.js'),
  /PUBG_API_KEY|SUPABASE_SERVICE_KEY|DISCORD_BOT_TOKEN|buildReplay|requestAnimationFrame/);
});
