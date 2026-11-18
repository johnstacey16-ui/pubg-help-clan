'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const script=fs.readFileSync(path.join(__dirname,'../assets/site.js'),'utf8');
const modes=['solo','duo','squad','solo-fpp','duo-fpp','squad-fpp'];
const players=['xbox','psn'].map((platform,i)=>({
 name:'TwinTag',platform,kills:i?9:40,wins:i?1:4,matches:i?10:20,
 kd:i?.9:2,winRate:10,updatedAt:'2026-11-17T15:00:00Z',
 modes:{squad:{roundsPlayed:10,kills:i?9:40,wins:i?1:4}},
 advanced:{damage:i?550:2500}
}));
const overview={
 schemaVersion:1,players,
 roster:{total:2,verified:2,entries:players.map(p=>({
  name:p.name,platform:p.platform,verified:true,status:'matched'})),states:{}},
 totals:{kills:49,wins:5,matches:30},
 platforms:{xbox:1,psn:1},
 modeOrder:modes,modeTotals:Object.fromEntries(modes.map(m=>[m,{
  matches:0,kills:0,wins:0,damage:0,assists:0
 }])),lastSync:'2026-11-17T15:00:00Z'
};
async function app(){
 const els={},requests=[],listeners={};
 function el(id){
  if(els[id])return els[id];
  const defaults={sort:'kills','leader-console':'all','player-console':'all',
   'player-status':'all','roster-sort':'name','roster-page-size':'20',
   'compare-mode':'all','weapon-category':'total','season-type':'season',
   'season-history-mode':'squad','console-platform':'auto'};
  return els[id]={id,value:defaults[id]??'',innerHTML:'',textContent:'',
   disabled:false,hidden:false,checked:false,open:false,style:{},dataset:{},
   classList:{toggle(){}},addEventListener(name,fn){this.events[name]=fn},
   events:{},setAttribute(){},removeAttribute(){},
   showModal(){this.open=true},close(){this.open=false}};
 }
 const document={getElementById:el,querySelectorAll(){return []},
  addEventListener(name,fn){listeners[name]=fn}};
 const fetch=async(url,opts={})=>{
  requests.push({url,opts});
  if(url==='/api/public-stats')return{ok:true,json:async()=>overview};
  if(url.startsWith('/api/public-matches?'))
   return{ok:true,json:async()=>({schemaVersion:1,matches:[],availableCount:0,archivedCount:0})};
  if(url.startsWith('/api/public-insights?'))
   return{ok:true,json:async()=>({schemaVersion:1,kind:'weapons',items:[],count:0,note:'No saved data'})};
  if(url.startsWith('/api/public-season?'))
   return{ok:true,json:async()=>({schemaVersion:1,type:'season',seasonId:null,
    note:'No saved data',archivedSeasons:[],modes:[],history:[],historyCount:0})};
  if(url.startsWith('/api/player-history?'))
   return{ok:true,json:async()=>({schemaVersion:1,points:[]})};
  throw Error('Unexpected request '+url);
 };
 vm.runInNewContext(script,{document,window:{scrollTo(){},prompt(){}},
  history:{replaceState(){},pushState(){}},
  location:{origin:'https://example.test',hash:'#overview'},
  navigator:{clipboard:{}},console:{error(){}},fetch});
 for(let i=0;i<65;i++)await Promise.resolve();
 return {el,requests,listeners};
}
const key=platform=>JSON.stringify([platform,'TwinTag']);
test('same-name console profiles remain separate in all player pickers',async()=>{
 const a=await app();
 for(const id of ['match-player','weapons-player','teammates-player',
  'season-player','compare-one','compare-two']){
  const html=a.el(id).innerHTML;
  assert.match(html,/TwinTag · Xbox/,id);
  assert.match(html,/TwinTag · PlayStation/,id);
  assert.match(html,/value="\[&quot;xbox&quot;,&quot;TwinTag&quot;\]"/,id);
  assert.match(html,/value="\[&quot;psn&quot;,&quot;TwinTag&quot;\]"/,id);
 }
 assert.equal(a.el('match-player').value,key('xbox'));
});
test('selecting PSN routes match, weapon, and season data only to PSN',async()=>{
 const a=await app(),psn=key('psn');
 a.el('match-player').value=psn;
 a.el('match-player').events.change({target:{value:psn}});
 a.el('weapons-player').value=psn;
 a.el('weapons-player').events.change({target:{value:psn}});
 a.el('season-player').value=psn;
 a.el('season-player').events.change({target:{value:psn}});
 for(let i=0;i<45;i++)await Promise.resolve();
 const urls=a.requests.map(x=>x.url);
 assert.ok(urls.some(u=>u.startsWith('/api/public-matches?name=TwinTag&platform=psn')));
 assert.ok(urls.some(u=>u.includes('/api/public-insights?kind=weapons&name=TwinTag&platform=psn')));
 assert.ok(urls.some(u=>u.includes('/api/public-season?name=TwinTag&platform=psn&type=season')));
 assert.equal(urls.some(u=>u.includes('name=%5B%22psn%22')),false,'never send UI option tuples as gamertags');
});
test('comparison keeps Xbox and PSN distinct rather than selecting first name',async()=>{
 const a=await app();
 a.el('compare-one').events.change({target:{value:key('xbox')}});
 a.el('compare-two').events.change({target:{value:key('psn')}});
 assert.match(a.el('compare-output').innerHTML,/TwinTag · Xbox/);
 assert.match(a.el('compare-output').innerHTML,/TwinTag · PlayStation/);
 assert.match(a.el('compare-output').innerHTML,/2,500/);
 assert.match(a.el('compare-output').innerHTML,/550/);
});
test('profile button resolves the requested platform and reads only its history',async()=>{
 const a=await app();
 a.listeners.click({target:{closest(selector){
  return selector==='[data-profile]'?{dataset:{
   profile:'TwinTag',profilePlatform:'psn'}}:null;
 }}});
 for(let i=0;i<30;i++)await Promise.resolve();
 assert.equal(a.el('profile-name').textContent,'TwinTag');
 assert.equal(a.el('profile-console').textContent,'PlayStation');
 assert.ok(a.requests.some(x=>x.url==='/api/player-history?name=TwinTag&platform=psn'));
 assert.match(a.el('profile-body').innerHTML,/data-match-player="/);
 assert.match(a.el('profile-body').innerHTML,/&quot;psn&quot;/);
});
