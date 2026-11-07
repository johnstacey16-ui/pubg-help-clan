'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {publicClanWeaponBoard,aggregateWeaponRecords,METRICS}=
 require('../lib/web-clan-weapons');
const {sortWeapons,csvRows,csvSafe}=require('../assets/clan-weapon-board');
const mastery=(m416,beryl)=>({data:{attributes:{weaponSummaries:{
 Item_Weapon_M416_C:m416,
 ...(beryl?{Item_Weapon_BerylM762_C:beryl}:{})
}}}});
const a=mastery({
 OfficialStatsTotal:{Kills:20,HeadShots:5,DamagePlayer:2050,LongestKill:200},
 CompetitiveStatsTotal:{Kills:3,DamagePlayer:250},
 StatsTotal:{Kills:950}
},{
 OfficialStatsTotal:{Kills:0,HeadShots:0,LongestKill:210},
 StatsTotal:{Kills:100}
});
const b=mastery({
 OfficialStatsTotal:{Kills:11,DamagePlayer:1250,LongestKill:340},
 CompetitiveStatsTotal:{Kills:6},
 StatsTotal:{Kills:650,DamagePlayer:80000}
});
const payloads=[
 {name:'Alpha',platform:'xbox',payload:a},
 {name:'Bravo',platform:'psn',payload:b}
];
function fakeDb(opts={}){
 const calls=[];
 const official=opts.members||[
  {gamertag:'Alpha',is_clan_member:true,status:'matched'},
  {gamertag:'Bravo',is_clan_member:true,status:'matched'},
  {gamertag:'Outsider',is_clan_member:false,status:'matched'},
  {gamertag:'Pending',is_clan_member:true,status:'pending'}
 ];
 const players=opts.players||[
  {gamertag:'Alpha',platform:'xbox',pubg_account_id:'account.ALPHA'},
  {gamertag:'Bravo',platform:'psn',pubg_account_id:'account.BRAVO'},
  {gamertag:'Outsider',platform:'xbox',pubg_account_id:'account.OUTSIDER'},
  {gamertag:'Pending',platform:'xbox',pubg_account_id:'account.PENDING'}
 ];
 const records=[
  {cache_key:'pubg:v1:xbox/players/account.ALPHA/weapon_mastery',
   payload:a,fetched_at:'2026-11-05T10:00:00Z',apiSecret:'do-not-show'},
  {cache_key:'pubg:v1:psn/players/account.BRAVO/weapon_mastery',
   payload:b,fetched_at:'2026-11-07T09:00:00Z'},
  {cache_key:'pubg:v1:xbox/players/account.OUTSIDER/weapon_mastery',
   payload:mastery({OfficialStatsTotal:{Kills:100000}})}
 ];
 return{calls,from(table){
  const q={keys:[],select(){return this;},eq(){return this;},
   in(field,keys){assert.equal(field,'cache_key');this.keys=keys;return this;},
   async limit(){calls.push({table,keys:this.keys});
    if(opts.fail===table)return{error:{message:'db'},data:null};
    return{data:table==='player_import_queue'?official:
     table==='players'?players:records.filter(r=>this.keys.includes(r.cache_key)),error:null};
   }
  };return q;
 }};
}
test('clan board respects verified membership and reads only saved cache',async()=>{
 const db=fakeDb();
 const result=await publicClanWeaponBoard(db);
 assert.equal(result.status,200);
 const p=result.body;
 assert.equal(p.verifiedMembers,2);
 assert.equal(p.resolvedConsoleAccounts,2);
 assert.equal(p.cachedMasteryPlayers,2);
 assert.equal(p.contributingPlayers,2);
 assert.equal(p.oldestSavedAt,'2026-11-05T10:00:00Z');
 assert.equal(p.newestSavedAt,'2026-11-07T09:00:00Z');
 assert.deepEqual(db.calls.map(c=>c.table),['player_import_queue','players','pubg_endpoint_cache']);
 assert.equal(db.calls[2].keys.length,2);
 assert.ok(db.calls[2].keys.every(s=>!s.includes('OUTSIDER')&&!s.includes('PENDING')));
 assert.doesNotMatch(JSON.stringify(p),
  /account\.|OUTSIDER|PENDING|do-not-show|apiSecret|cache_key|pubg_account_id/);
 assert.match(p.note,/No PUBG requests/);
});
test('official, competitive and frozen legacy mastery never combine',()=>{
 const rows=aggregateWeaponRecords(payloads);
 const m=rows.find(w=>w.name==='M416');
 assert.equal(m.playersWithRecord,2);
 assert.equal(m.sources.official.metrics.kills.value,31);
 assert.equal(m.sources.competitive.metrics.kills.value,9);
 assert.equal(m.sources.total.metrics.kills.value,1600);
 assert.equal(m.sources.official.metrics.kills.observed,2);
 assert.equal(m.sources.official.metrics.headshots.value,5);
 assert.equal(m.sources.official.metrics.headshots.observed,1);
 assert.equal(m.sources.official.metrics.damage.value,3300);
 assert.equal(m.sources.official.metrics.damage.observed,2);
 assert.equal(m.sources.official.metrics.longestKill.value,340);
 assert.equal(m.sources.official.metrics.longestKill.observed,2);
 assert.equal(m.sources.competitive.metrics.damage.observed,1);
 assert.equal(m.sources.total.metrics.damage.value,80000);
 assert.equal(m.sources.total.metrics.damage.observed,1);
 assert.deepEqual(m.sources.official.leaders.map(p=>p.name),['Alpha','Bravo']);
 assert.equal(m.sources.official.leaders[0].kills,20);
 const beryl=rows.find(w=>w.name==='BerylM762');
 assert.equal(beryl.sources.official.metrics.kills.value,0);
 assert.equal(beryl.sources.official.metrics.kills.observed,1);
 assert.equal(beryl.sources.official.metrics.damage.value,null);
 assert.equal(beryl.sources.official.metrics.damage.observed,0);
 assert.equal(beryl.sources.official.metrics.longestKill.value,210);
 assert.equal(beryl.sources.competitive.players,0);
 assert.equal(beryl.sources.competitive.metrics.kills.value,null);
 assert.equal(METRICS.length,6);
});
test('unsupported or malformed weapon values never contribute figures',()=>{
 const malicious=aggregateWeaponRecords([{name:'Alpha',platform:'xbox',
  payload:mastery({OfficialStatsTotal:{
   Kills:-10,DamagePlayer:'not-a-number',HeadShots:true,
   LongestKill:0,Groggies:12,Defeats:3}})}]);
 const m=malicious[0];
 assert.equal(m.sources.official.metrics.kills.value,null);
 assert.equal(m.sources.official.metrics.kills.observed,0);
 assert.equal(m.sources.official.metrics.longestKill.value,0);
 assert.equal(m.sources.official.metrics.knocks.value,12);
 assert.equal(m.sources.official.metrics.defeats.value,3);
 assert.equal(m.sources.official.leaders.length,0);
});
test('missing mastery cache is an honest zero-coverage, not fabricated weapon history',async()=>{
 const db=fakeDb({members:[{gamertag:'Alpha',is_clan_member:true,status:'matched'}],
  players:[{gamertag:'Alpha',platform:'xbox',pubg_account_id:'account.ALPHA-NOTCACHED'}]});
 const r=await publicClanWeaponBoard(db);
 assert.equal(r.body.verifiedMembers,1);
 assert.equal(r.body.cachedMasteryPlayers,0);
 assert.equal(r.body.contributingPlayers,0);
 assert.deepEqual(r.body.weapons,[]);
 assert.equal(r.body.oldestSavedAt,null);
 assert.equal(r.body.newestSavedAt,null);
});
test('duplicate saved account rows are never counted twice',async()=>{
 const players=[
  {gamertag:'Alpha',platform:'xbox',pubg_account_id:'account.ALPHA'},
  {gamertag:'ALPHA',platform:'xbox',pubg_account_id:'account.ALPHA'}
 ];
 const r=await publicClanWeaponBoard(fakeDb({members:[
  {gamertag:'Alpha',is_clan_member:true,status:'matched'}],players}));
 assert.equal(r.body.resolvedConsoleAccounts,1);
 assert.equal(r.body.weapons.find(x=>x.name==='M416').sources.official.metrics.kills.value,20);
});
test('backend errors do not silently produce an empty successful report',async()=>{
 await assert.rejects(publicClanWeaponBoard(fakeDb({fail:'pubg_endpoint_cache'})),/unavailable/);
});
test('frontend sort distinguishes missing fields and saves exact source',()=>{
 const items=aggregateWeaponRecords(payloads);
 assert.equal(sortWeapons(items,'official','kills','')[0].name,'M416');
 assert.equal(sortWeapons(items,'official','players','Beryl').length,1);
 assert.equal(sortWeapons(items,'competitive','damage','')[0].name,'M416');
 const result=csvRows(items,'official');
 assert.match(result,/M416/);
 assert.match(result,/BerylM762/);
 assert.match(result,/"Official"/i); // source field is explicit
 assert.doesNotMatch(result,/account\.|apiSecret/);
 assert.equal(csvSafe('=2+3'),'"\'=2+3"');
 assert.equal(csvSafe(' @SUM(1)'),'"\' @SUM(1)"');
 assert.equal(csvSafe('normal'),'\"normal\"');
});
test('website and toolkit both include on-demand feature without any new Vercel function',()=>{
 const root=path.resolve(__dirname,'..');
 const read=p=>fs.readFileSync(path.join(root,p),'utf8');
 for(const file of ['training/index.html','index.html']){
  const html=read(file);
  for(const id of ['clan-weapon-load','clan-weapon-source',
   'clan-weapon-sort','clan-weapon-search','clan-weapon-export',
   'clan-weapon-coverage','clan-weapon-rows','clan-weapon-leaders'])
   assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(html,/\/assets\/clan-weapon-board\.css/);
 }
 assert.match(read('training/js/clan-dashboard-loader.js'),/\/assets\/clan-weapon-board\.js/);
 assert.match(read('index.html'),/\/assets\/clan-weapon-board\.js/);
 assert.match(read('assets/site.js'),/ClanWeaponBoard\?\.init/);
 assert.match(read('api/public-insights.js'),/route==='clan-weapons'/);
 assert.match(read('api/public-insights.js'),/publicClanWeaponBoard/);
 assert.match(read('package.json'),/node --check lib\/web-clan-weapons\.js/);
 assert.doesNotMatch(read('assets/clan-weapon-board.js'),/SUPABASE_SERVICE_KEY|PUBG_API_KEY|DISCORD_BOT_TOKEN/);
});
