'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const script=fs.readFileSync(path.join(__dirname,'../assets/survival-view.js'),'utf8');
function browser(){
 const nodes={},requests=[];
 function get(id){
  if(!nodes[id])nodes[id]={id,value:'',innerHTML:'',textContent:'',
    disabled:false,events:{},addEventListener(name,fn){this.events[name]=fn;}};
  return nodes[id];
 }
 const window={};
 const fetch=async(url,options)=>{
  requests.push({url,options});
  if(url.startsWith('/api/public-insights'))return{ok:true,json:async()=>({
   schemaVersion:1,kind:'survival',name:'Hero',
   savedAt:'2026-11-04T08:00:00Z',
   stats:{xp:122000,tier:2,level:140,totalMatchesPlayed:300}
  })};
  if(url==='/api/player-refresh')return{ok:true,json:async()=>({
   schemaVersion:1,scope:'survival',state:'fresh'
  })};
  throw Error('Unexpected request: '+url);
 };
 vm.runInNewContext(script,{window,document:{getElementById:get},
  fetch,URLSearchParams,console});
 return{get,api:window.SurvivalView,requests};
}
test('Survival Mastery shows real saved fields without account IDs',async()=>{
 const b=browser();
 b.api.setPlayers([{name:'Hero',platform:'xbox'}]);
 assert.equal(b.get('survival-name').value,'Hero');
 await b.get('survival-load').events.click();
 assert.match(b.get('survival-data').innerHTML,/122,000/);
 assert.match(b.get('survival-data').innerHTML,/140/);
 assert.match(b.get('survival-data').innerHTML,/300/);
 assert.match(b.get('survival-status').textContent,/4 of 4/);
 assert.equal(b.requests.length,1);
 assert.doesNotMatch(b.get('survival-data').innerHTML,/account\.|pubg_account_id/);
});
test('Refresh Survival uses existing same-origin POST route and known console auto detection',async()=>{
 const b=browser();
 b.api.setPlayers([{name:'Hero',platform:'xbox'}]);
 await b.get('survival-refresh').events.click();
 assert.equal(b.requests.length,2);
 assert.equal(b.requests[0].url,'/api/player-refresh');
 assert.equal(b.requests[0].options.method,'POST');
 assert.deepEqual(JSON.parse(b.requests[0].options.body),{
  name:'Hero',platform:'auto',scope:'survival'
 });
 assert.match(b.requests[1].url,/kind=survival/);
});

test('Survival Mastery can select a saved PSN identity explicitly',async()=>{
 const b=browser();
 b.api.setPlayers([{name:'Hero',platform:'xbox'},{name:'Hero',platform:'psn'}]);
 b.get('survival-platform').value='psn';
 await b.get('survival-refresh').events.click();
 assert.deepEqual(JSON.parse(b.requests[0].options.body),{
  name:'Hero',platform:'psn',scope:'survival'
 });
 const read=new URL(b.requests[1].url,'https://example.test');
 assert.equal(read.searchParams.get('name'),'Hero');
 assert.equal(read.searchParams.get('platform'),'psn');
 assert.equal(read.searchParams.get('kind'),'survival');
 assert.equal((b.get('survival-known').innerHTML.match(/value="Hero"/g)||[]).length,1,
  'duplicate console names appear once in the name suggestions');
});
test('changing a gamertag resets any previously selected console',()=>{
 const b=browser();
 b.get('survival-platform').value='psn';
 b.get('survival-name').events.input();
 assert.equal(b.get('survival-platform').value,'auto');
});
test('both standalone and combined dashboard include Survival console selection',()=>{
 for(const source of ['index.html','training/index.html']){
  const html=fs.readFileSync(path.join(__dirname,'..',source),'utf8');
  assert.match(html,/id="survival-platform"/);
  assert.match(html,/<option value="psn">PlayStation<\/option>/);
 }
});
