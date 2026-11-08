'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {
 rows,filter,summary,groups,recentTrend,recentForm,squadStats,fmt,pct
}=require('../assets/match-lab');
const items=[
 {id:'one',map:'Baltic_Main',mode:'squad',playedAt:'2026-11-02T10:00:00Z',
  placement:1,kills:5,damage:800,assists:2,knocks:3,squad:[
   {name:'Me',isSelf:true,kills:5,damage:800,assists:2},
   {name:'Friend',isSelf:false,kills:3,damage:150,assists:1},
   {name:'FRIEND',isSelf:false,kills:99,damage:9999,assists:99}]},
 {id:'two',map:'Baltic_Main',mode:'squad',playedAt:'2026-11-03T10:00:00Z',
  placement:12,kills:0,damage:50,assists:0,knocks:0,
  squad:[{name:'Me',isSelf:true,kills:0},{name:'Friend',kills:0}]},
 {id:'three',map:'Desert_Main',mode:'solo',playedAt:'2026-11-05T10:00:00Z',
  placement:7,kills:3,damage:400,assists:0,knocks:1},
 {id:'four',map:'Desert_Main',mode:'duo',playedAt:'2026-11-06T10:00:00Z',
  placement:null,kills:null,damage:null,assists:null},
 {id:'two',map:'Baltic_Main',mode:'squad',playedAt:'2026-11-03T10:00:00Z',
  placement:12,kills:50000,damage:50000}
];
test('deduplicates source match IDs and honours observed zero',()=>{
 assert.equal(rows(items).length,4);
 assert.equal(summary(rows(items)).count,4);
 assert.equal(summary(rows(items)).wins,1);
 assert.equal(summary(rows(items)).ranked,3);
 assert.equal(summary(rows(items)).kills,8);
 assert.equal(summary(rows(items)).killsObserved,3);
 assert.equal(summary(rows(items)).killsPerMatch,8/3);
 assert.equal(summary(rows(items)).damageObserved,3);
 assert.equal(summary(rows(items)).avgPlace,20/3);
 assert.equal(summary(rows(items)).top10Rate,200/3);
 assert.equal(summary([{id:'x',placement:null}]).winRate,null);
 assert.equal(summary([]).damagePerMatch,null);
});
test('map mode and placements filter only real saved records',()=>{
 assert.deepEqual(filter(items,{map:'Baltic_Main'}).map(m=>m.id),['two','one']);
 assert.deepEqual(filter(items,{mode:'solo'}).map(m=>m.id),['three']);
 assert.deepEqual(filter(items,{outcome:'win'}).map(m=>m.id),['one']);
 assert.deepEqual(filter(items,{outcome:'top10'}).map(m=>m.id),['three','one']);
 assert.deepEqual(filter(items,{outcome:'other'}).map(m=>m.id),['two']);
 assert.deepEqual(filter(items,{outcome:'unknown'}).map(m=>m.id),['four']);
 assert.deepEqual(filter(items,{order:'kills'}).map(m=>m.id),['one','three','two','four']);
 assert.deepEqual(filter(items,{order:'oldest'}).map(m=>m.id),['one','two','three','four']);
 assert.deepEqual(filter(items,{order:'placement'}).map(m=>m.id),['one','three','two','four']);
});
test('per-map and per-mode analysis is bounded to the visible match sample',()=>{
 const byMap=groups(filter(items,{mode:'squad'}),'map');
 assert.equal(byMap.length,1);
 assert.equal(byMap[0].count,2);
 assert.equal(byMap[0].winRate,50);
 assert.equal(byMap[0].killsPerMatch,2.5);
 const byMode=groups(rows(items),'mode');
 assert.deepEqual(byMode.map(m=>m.name),['squad','duo','solo']);
 assert.equal(byMode.find(m=>m.name==='duo').winRate,null);
});
test('recorded squad share ignores duplicate names and absent squad fields',()=>{
 const result=squadStats(items[0]);
 assert.equal(result.members,2);
 assert.equal(result.teamKills,8);
 assert.equal(result.teamDamage,950);
 assert.equal(result.share,62.5);
 assert.equal(squadStats(items[2]),null);
 assert.equal(squadStats(items[1]).share,null);
});
test('recent chart shows only real matches in chronological order and does not mutate input',()=>{
 const before=items.slice();
 assert.deepEqual(recentTrend(items,'damage',3).map(x=>x.id),['two','three','four']);
 assert.equal(recentTrend(items,'damage',3)[2].value,null);
 assert.deepEqual(items,before);
 assert.equal(fmt(null),'—');
 assert.equal(pct(null),'—');
 assert.equal(pct(50),'50%');
});

test('Recent Form compares exact newest and preceding 10 dated distinct saved games',()=>{
 const games=Array.from({length:23},(_,i)=>({
  id:'game-'+i,playedAt:new Date(Date.UTC(2026,10,30-i)).toISOString(),
  kills:i<10?3:i<20?1:50,damage:i<10?400:i<20?200:5000,
  placement:i<10?(i<3?1:i<8?5:15):
    i<20?(i===10?1:i<14?10:20):1
 }));
 const source=games.slice().reverse();
 source.push({...games[0],kills:10000,damage:10000});
 const before=source.slice(),form=recentForm(source);
 assert.equal(form.latestCount,10);
 assert.equal(form.previousCount,10);
 assert.equal(form.datedCount,23);
 assert.equal(form.undatedCount,0);
 assert.equal(form.verdict,'Improving');
 assert.equal(form.better,5);
 assert.equal(form.worse,0);
 const m=Object.fromEntries(form.metrics.map(row=>[row.key,row]));
 assert.equal(m.killsPerMatch.now,3);
 assert.equal(m.killsPerMatch.old,1);
 assert.equal(m.killsPerMatch.difference,2);
 assert.equal(m.damagePerMatch.difference,200);
 assert.equal(m.wins.now,3);
 assert.equal(m.wins.old,1);
 assert.equal(m.top10.now,8);
 assert.equal(m.top10.old,4);
 assert.equal(m.avgPlace.now,5.8);
 assert.equal(m.avgPlace.old,15.1);
 assert.equal(m.avgPlace.difference,-9.3);
 assert.equal(m.avgPlace.direction,'better','lower placement number is better');
 assert.deepEqual(source,before,'must not mutate API data or reorder input');
});
test('partial history and undated matches never yield a fabricated form verdict',()=>{
 const games=Array.from({length:14},(_,i)=>({
  id:'saved-'+i,playedAt:new Date(Date.UTC(2026,10,30-i)).toISOString(),
  placement:1,kills:0,damage:0
 }));
 games.push({id:'undated',playedAt:null,placement:1,kills:999});
 const form=recentForm(games);
 assert.equal(form.latestCount,10);
 assert.equal(form.previousCount,4);
 assert.equal(form.undatedCount,1);
 assert.equal(form.verdict,'Not enough history');
 assert.ok(form.metrics.every(m=>m.direction==='unavailable'));
 assert.equal(form.metrics[0].now,0,'observed zero must remain zero');
 assert.equal(form.metrics[0].oldObserved,4);
 assert.equal(recentForm([]).verdict,'Not enough history');
});
test('missing official stats suppress changes for unobserved metrics',()=>{
 const games=Array.from({length:20},(_,i)=>({
  id:'match'+i,playedAt:new Date(Date.UTC(2026,10,30-i)).toISOString(),
  placement:i<10?1:12,kills:i<10?3:1,damage:i<10?300:100
 }));
 games[0].kills=null;games[11].damage=null;games[12].placement=null;
 const form=recentForm(games);
 const m=Object.fromEntries(form.metrics.map(row=>[row.key,row]));
 assert.equal(form.verdict,'Incomplete stats');
 assert.equal(m.killsPerMatch.nowObserved,9);
 assert.equal(m.killsPerMatch.now,3);
 assert.equal(m.killsPerMatch.direction,'unavailable');
 assert.equal(m.damagePerMatch.oldObserved,9);
 assert.equal(m.damagePerMatch.direction,'unavailable');
 assert.equal(m.avgPlace.oldObserved,9);
 assert.equal(m.wins.direction,'unavailable');
 assert.equal(m.top10.direction,'unavailable');
});
test('declining, mixed and steady form are distinct from improving',()=>{
 const dates=Array.from({length:20},(_,i)=>({
  id:'match'+i,playedAt:new Date(Date.UTC(2026,10,30-i)).toISOString()
 }));
 const declining=dates.map((m,i)=>({...m,
  kills:i<10?0:5,damage:i<10?50:500,placement:i<10?20:1}));
 assert.equal(recentForm(declining).verdict,'Declining');
 assert.equal(recentForm(declining).worse,5);
 const steady=dates.map(m=>({...m,kills:0,damage:0,placement:10}));
 assert.equal(recentForm(steady).verdict,'Steady');
 assert.ok(recentForm(steady).metrics.every(m=>m.direction==='same'));
 const mixed=dates.map((m,i)=>({...m,
  kills:i<10?3:2,damage:i<10?100:200,placement:i<10?1:2}));
 assert.equal(recentForm(mixed).verdict,'Mixed form');
});
