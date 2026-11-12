'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {main}=require('../scripts/collect-pubg-backfill');
const {AUDIENCE}=require('../lib/github-oidc');

test('GitHub workflow obtains OIDC identity and starts the backfill API request',async()=>{
 const oldFetch=global.fetch;
 const keys=['PUBG_SYNC_CRON_SECRET','ACTIONS_ID_TOKEN_REQUEST_URL',
   'ACTIONS_ID_TOKEN_REQUEST_TOKEN','PUBG_BACKFILL_CYCLES'];
 const old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 const calls=[];
 try{
  delete process.env.PUBG_SYNC_CRON_SECRET;
  process.env.PUBG_BACKFILL_CYCLES='1';
  process.env.ACTIONS_ID_TOKEN_REQUEST_URL=
   'https://pipelinesghubeus12.actions.githubusercontent.com/runner/oidc';
  process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN='mock-gh-token-not-a-secret';
  global.fetch=async (target,opts)=>{
   const url=new URL(String(target));
   calls.push(url.toString());
   if(url.hostname.endsWith('.actions.githubusercontent.com')){
    assert.equal(url.searchParams.get('audience'),AUDIENCE);
    assert.equal(opts.headers.Authorization,'Bearer mock-gh-token-not-a-secret');
    return {ok:true,json:async()=>({value:'test.header.signature'})};
   }
   assert.equal(url.href,'https://pubg-help-clan.vercel.app/api/sync?mode=backfill');
   assert.equal(opts.headers.Authorization,'Bearer test.header.signature');
   return {ok:true,json:async()=>({status:'no_work',
    extras:{claimed:0,pending:200},seasonCollection:{playersAttempted:0}})};
  };
  await main();
  assert.equal(calls.length,2,'should request one OIDC token and one backfill cycle');
 }finally{
  global.fetch=oldFetch;
  for(const k of keys){
   if(old[k]===undefined)delete process.env[k];
   else process.env[k]=old[k];
  }
 }
});
test('runner fails on a legacy production response without season collection',async()=>{
 const oldFetch=global.fetch;
 const oldSecret=process.env.PUBG_SYNC_CRON_SECRET;
 const oldCycles=process.env.PUBG_BACKFILL_CYCLES;
 try{
  process.env.PUBG_SYNC_CRON_SECRET='test-only-secret';
  process.env.PUBG_BACKFILL_CYCLES='1';
  global.fetch=async()=>({ok:true,json:async()=>({status:'no_work',
   extras:{claimed:0}})});
  await assert.rejects(()=>main(),/missing season collection status/);
 }finally{
  global.fetch=oldFetch;
  if(oldSecret===undefined)delete process.env.PUBG_SYNC_CRON_SECRET;
  else process.env.PUBG_SYNC_CRON_SECRET=oldSecret;
  if(oldCycles===undefined)delete process.env.PUBG_BACKFILL_CYCLES;
  else process.env.PUBG_BACKFILL_CYCLES=oldCycles;
 }
});
test('runner never shadows the JavaScript URL constructor',()=>{
 const fs=require('node:fs');
 const path=require('node:path');
 const src=fs.readFileSync(path.join(__dirname,'../scripts/collect-pubg-backfill.js'),'utf8');
 assert.doesNotMatch(src,/\b(?:const|let|var)\s+URL\s*=/);
 assert.match(src,/const BACKFILL_ENDPOINT=/);
 assert.match(src,/new URL\(raw\)/);
});
