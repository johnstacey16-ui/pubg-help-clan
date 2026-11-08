'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {mapName,dictionaries}=require('../assets/pubg-dictionaries');
const mapPairs={
 Baltic_Main:'Erangel',Erangel_Main:'Erangel',Desert_Main:'Miramar',
 Tiger_Main:'Taego',Savage_Main:'Sanhok',DihorOtok_Main:'Vikendi',
 Summerland_Main:'Karakin',Chimera_Main:'Paramo',
 Heaven_Main:'Haven',Kiki_Main:'Deston',Neon_Main:'Rondo',
 Range_Main:'Camp Jackal'
};
test('all official PUBG telemetry map IDs resolve to actual in-game names',()=>{
 assert.deepEqual(Object.keys(mapPairs).sort(),
  Object.keys(dictionaries.map.values).sort());
 for(const [code,expected] of Object.entries(mapPairs))
  assert.equal(mapName(code),expected,code);
});
test('map display aliases are idempotent and unknown codes are not guessed',()=>{
 assert.equal(mapName('Erangel'),'Erangel');
 assert.equal(mapName('Miramar'),'Miramar');
 assert.equal(mapName('Unknown map'),'Unknown map');
 assert.equal(mapName('FutureWorld_Main'),'FutureWorld_Main');
 assert.equal(mapName(null),'Unknown map');
 assert.equal(mapName(''),'Unknown map');
 assert.equal(mapName(' __proto__ '),'__proto__');
});
test('dashboard loads official map dictionary before each view needing friendly map names',()=>{
 const loader=fs.readFileSync(path.join(__dirname,'../training/js/clan-dashboard-loader.js'),'utf8');
 const root=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 for(const source of [loader,root]){
  const index=source.indexOf('/assets/pubg-dictionaries.js');
  assert.ok(index!==-1);
  for(const file of ['match-lab','clan-match-board','personal-rivalries',
    'telemetry-view','match-lobby','clan-record-book','lobby-opponents']){
    assert.ok(index<source.indexOf('/assets/'+file+'.js'),file+' loads after the dictionary');
  }
 }
});
test('map filters keep raw values while their labels use human names',()=>{
 const base=path.join(__dirname,'..');
 for(const file of ['assets/match-lab.js','assets/clan-match-board.js',
  'assets/telemetry-view.js','assets/lobby-opponents.js']){
  const content=fs.readFileSync(path.join(base,file),'utf8');
  assert.match(content,/displayMap\(/,file);
  assert.match(content,/<option value=/,file);
 }
 for(const file of ['assets/personal-rivalries.js','assets/match-lobby.js',
  'assets/clan-record-book.js','lib/squad-analysis.js']){
  const content=fs.readFileSync(path.join(base,file),'utf8');
  assert.match(content,/displayMap\(|mapName\(/,file);
 }
});
