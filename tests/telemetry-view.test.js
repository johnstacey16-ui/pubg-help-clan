'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const code=fs.readFileSync(path.join(__dirname,'../assets/telemetry-view.js'),'utf8');
function browser(){
 const nodes={},calls=[];
 function $(id){
  if(nodes[id])return nodes[id];
  return nodes[id]={id,value:'',
   innerHTML:'',textContent:'',disabled:false,dataset:{},events:{},
   addEventListener(type,callback){this.events[type]=callback;}};
 }
 const fakeReport={
  schemaVersion:1,matchId:'e7ff11aa-2222-3333-4444-555555555555',
  player:'Hero',cache:'saved',note:'Actual observed PUBG matches',
  sourceEvents:950,
  combatSummary:{kills:1,deaths:0,damageDealt:40,damageTaken:null,
   knocks:1,revives:0},rivals:[{name:'Opponent',kills:1,deaths:0,
    damageDealt:40,damageTaken:null}],
  weapons:[{name:'WeapAK47_C',damage:40}],
  playerEvents:[{sourceIndex:10,type:'LogPlayerTakeDamage',
    timestamp:'2026-11-03T12:00:07Z',actor:'Hero',subject:'Opponent',
    timeSeconds:7,damage:40},
    {sourceIndex:25,type:'LogPlayerKillV2',
     timestamp:'2026-11-03T12:00:12Z',actor:'Hero',subject:'Opponent',
     timeSeconds:12,damage:null}],
  activityCoverage:{observed:2,returned:2,truncated:false}
 };
 const window={
  requestAnimationFrame(){return 1;},cancelAnimationFrame(){},
  URL:{createObjectURL(){return'blob:fake';},revokeObjectURL(){}}
 };
 const ctx={window,document:{getElementById:$,hidden:false,
   createElement(){return{click(){},set href(v){this._href=v;}}}},
   fetch:async url=>{
    calls.push(url);
    assert.match(url,/\/api\/public-matches\?/);
    assert.match(url,/route=rivals/);
    const opponent=new URL(url,'https://example.test').searchParams.get('opponent');
    return{ok:true,json:async()=>opponent?{
     schemaVersion:2,matchesScanned:2,matchesAnalysed:2,
     encountersReturned:2,encountersAvailable:2,
     encounters:[
      {map:'Baltic_Main',mode:'squad',playedAt:'2026-11-03T12:00:00Z',
       kills:1,deaths:0,damageDealt:50,damageTaken:null},
      {map:'Desert_Main',mode:'solo',playedAt:'2026-11-02T12:00:00Z',
       kills:0,deaths:1,damageDealt:null,damageTaken:20}
     ]
    }:{
     schemaVersion:2,matchesScanned:3,matchesAnalysed:2,undatedMatches:0,
     opponentNames:2,mapOptions:['Baltic_Main','Desert_Main'],
     modeOptions:['solo','squad'],filterDays:0,
     rivals:[{name:'Opponent',matchesSampled:2,kills:1,deaths:1,
      damageDealt:50,damageTaken:20,damageDealtObserved:1,
      damageTakenObserved:1,lastMatchAt:'2026-11-03T12:00:00Z'},
     {name:'Another',matchesSampled:1,kills:0,deaths:1,
      damageDealt:null,damageTaken:null,lastMatchAt:null}]
    }};
   },
   console,URL:window.URL,Blob:class Blob{constructor(parts){this.parts=parts;}},
   URLSearchParams};
 vm.runInNewContext(code,ctx);
 return{get:$,view:window.TelemetryView,report:fakeReport,calls};
}
test('event explorer and rival analysis controls remain without map replay tools',()=>{
 for(const id of ['telemetry-event-type','telemetry-event-search',
  'telemetry-event-list','telemetry-event-next','telemetry-event-prev',
  'telemetry-event-count','telemetry-event-export','telemetry-rivals-refresh',
  'telemetry-rivals-table','telemetry-rivals-count','telemetry-rivals-map',
  'telemetry-rivals-mode','telemetry-rivals-days','telemetry-rival-detail',
  'telemetry-rivals-search','telemetry-rivals-sort']){
  assert.ok(html.includes('id="'+id+'"'),id);
 }
});
test('source-indexed event filtering retains events without replay or coordinates',()=>{
 const b=browser();
 b.view.matchesChanged('Hero',[{id:b.report.matchId,map:'Erangel_Main'}]);
 b.view.renderForTest(b.report);
 assert.match(b.get('telemetry-event-list').innerHTML,/LogPlayerKillV2/);
 assert.doesNotMatch(b.get('telemetry-event-list').innerHTML,/data-telemetry-jump/);
 assert.match(b.get('telemetry-event-list').innerHTML,/>40<\/td>/);
 b.get('telemetry-event-type').value='LogPlayerKillV2';
 b.get('telemetry-event-type').events.change();
 assert.doesNotMatch(b.get('telemetry-event-list').innerHTML,/LogPlayerTakeDamage/);
 assert.match(b.get('telemetry-event-list').innerHTML,/LogPlayerKillV2/);
 assert.equal(b.calls.length,0);
});
test('neither dashboard page contains 2D replay controls or a map canvas',()=>{
 const root=path.join(__dirname,'..');
 for(const file of ['index.html','training/index.html']){
  const content=fs.readFileSync(path.join(root,file),'utf8');
  assert.match(content,/id="telemetry-event-list"/);
  assert.match(content,/id="telemetry-rivals-table"/);
  for(const id of ['telemetry-map','telemetry-track','telemetry-play','telemetry-time',
   'telemetry-zoom','telemetry-speed','telemetry-pan-left'])
   assert.doesNotMatch(content,new RegExp('id="'+id+'"'),file+' contains '+id);
  assert.doesNotMatch(content,/2D telemetry replay|Optional legacy 2D replay/);
 }
 assert.doesNotMatch(code,/requestAnimationFrame|<svg|data-telemetry-jump|report\\.replay/);
});
test('source event search avoids showing missing or invented entries',()=>{
 const b=browser();b.view.renderForTest(b.report);
 b.get('telemetry-event-search').value='unrelated-name';
 b.get('telemetry-event-search').events.input();
 assert.match(b.get('telemetry-event-list').innerHTML,/No real event rows/);
 assert.match(b.get('telemetry-event-count').textContent,/0 matching/);
});
test('observed cross-match rival trends request only cached derived report route',async()=>{
 const b=browser();
 b.view.matchesChanged('Hero',[{id:b.report.matchId,map:'Erangel_Main'}]);
 await b.get('telemetry-rivals-refresh').events.click();
 assert.equal(b.calls.length,1);
 assert.match(b.calls[0],/route=rivals/);
 assert.match(b.get('telemetry-rivals-table').innerHTML,/Opponent/);
 assert.match(b.get('telemetry-rivals-table').innerHTML,/50/);
 assert.match(b.get('telemetry-rivals-note').textContent,/2 distinct/);
});

test('saved rival intelligence filters, missing damage and source-only detail report',async()=>{
 const b=browser();
 b.view.matchesChanged('Hero',[{id:b.report.matchId,map:'Erangel_Main'}]);
 await b.get('telemetry-rivals-refresh').events.click();
 assert.match(b.get('telemetry-rivals-count').textContent,/2 visible name/);
 assert.match(b.get('telemetry-rivals-table').innerHTML,/n=1/);
 b.get('telemetry-rivals-search').value='Opponent';
 b.get('telemetry-rivals-search').events.input();
 assert.doesNotMatch(b.get('telemetry-rivals-table').innerHTML,/Another/);
 b.get('telemetry-rivals-search').value='';
 b.get('telemetry-rivals-search').events.input();
 b.get('telemetry-rivals-days').value='7';
 await b.get('telemetry-rivals-days').events.change();
 assert.match(b.calls[1],/days=7/);
 b.get('telemetry-rivals-map').value='Baltic_Main';
 await b.get('telemetry-rivals-map').events.change();
 assert.match(b.calls[2],/map=Baltic_Main/);
 b.get('telemetry-rivals-table').events.click({
  target:{closest(){return{dataset:{rivalName:'Opponent'}};}}
 });
 await new Promise(setImmediate);
 assert.match(b.calls.at(-1),/opponent=Opponent/);
 assert.match(b.get('telemetry-rival-detail').innerHTML,/Baltic_Main/);
 assert.match(b.get('telemetry-rival-detail').innerHTML,/Desert_Main/);
 assert.match(b.get('telemetry-rival-detail').innerHTML,/unavailable, not zero/);
});
