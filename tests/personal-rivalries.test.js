'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {leaders,visible,eligible}=require('../assets/personal-rivalries');
const rivals=[
 {name:'Rival Alpha',kills:6,deaths:2,matchesSampled:4},
 {name:'Rival Beta',kills:1,deaths:8,matchesSampled:5},
 {name:'Damage Only',kills:0,deaths:0,matchesSampled:1},
 {name:'Missing kills',kills:null,deaths:3,matchesSampled:1},
 {name:'<img onerror=evil()>',kills:1,deaths:1,matchesSampled:1}
];
test('rivalry leaders are direct kill counts, not whole-match damage or appearances',()=>{
 assert.equal(leaders(rivals).mostKilled.name,'Rival Alpha');
 assert.equal(leaders(rivals).mostKilledBy.name,'Rival Beta');
 assert.equal(eligible(rivals).length,4);
 assert.equal(leaders([{name:'No events',kills:0,deaths:0}]).mostKilled,null);
 assert.equal(leaders([{name:'No events',kills:null,deaths:null}]).mostKilledBy,null);
});
test('ranking is deterministic for killed-by, kills and trade volume',()=>{
 assert.equal(visible(rivals,'','kills')[0].name,'Rival Alpha');
 assert.equal(visible(rivals,'','deaths')[0].name,'Rival Beta');
 assert.equal(visible(rivals,'','trades')[0].name,'Rival Beta');
 assert.deepEqual(visible(rivals,'alpha').map(x=>x.name),['Rival Alpha']);
 assert.equal(visible(rivals,'unseen').length,0);
});
test('both dashboard entry routes include kill rivalry UI before optional telemetry',()=>{
 const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
 for(const p of ['index.html','training/index.html']){
  const html=read(p);
  for(const id of ['personal-rivals-panel','personal-rivals-player','personal-rivals-days',
   'personal-rivals-load','personal-rivals-status','personal-rivals-highlights',
   'personal-rivals-search','personal-rivals-sort','personal-rivals-table',
   'personal-rivals-detail','personal-rivals-analyse'])
   assert.match(html,new RegExp('id="'+id+'"'),p+' missing '+id);
  assert.ok(html.indexOf('id="personal-rivals-panel"')<html.indexOf('id="telemetry-opt-in"'));
  assert.match(html,/assets\/personal-rivalries\.css/);
 }
 assert.match(read('index.html'),/assets\/personal-rivalries\.js/);
 assert.match(read('training/js/clan-dashboard-loader.js'),/assets\/personal-rivalries\.js/);
 assert.match(read('assets/site.js'),/PersonalRivalries\?\.setPlayer/);
 assert.match(read('assets/personal-rivalries.js'),/route:'rivals'/);
 assert.doesNotMatch(read('assets/personal-rivalries.js'),/requestAnimationFrame|PUBG_API_KEY|SUPABASE_SERVICE_KEY|replay\.tracks|telemetry-cdn\.pubg\.com/);
});
test('saved rival server reports compute leaders over ALL valid groups',()=>{
 const s=readSource();
 assert.match(s,/const all=\[\.\.\.rivals\.values\(\)\]/);
 assert.match(s,/killLeaders/);
 assert.match(s,/web:kill-rivalry:v1:/);
});
function readSource(){return fs.readFileSync(path.join(__dirname,'../lib/web-rival-intelligence.js'),'utf8');}
