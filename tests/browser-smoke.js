'use strict';
// Actual Google Chrome tests against local synthetic data. No external API calls.
const assert=require('node:assert/strict');
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const {chromium}=require('playwright-core');
const root=path.join(__dirname,'..');
const modes=['solo','duo','squad','solo-fpp','duo-fpp','squad-fpp'];
const members=Array.from({length:55},(_,i)=>({
 name:'Member '+String(i+1).padStart(2,'0'),platform:'xbox',verified:true,
 status:'matched',is_clan_member:true
}));
const fixture={schemaVersion:1,
 players:members.map((p,i)=>({
  name:p.name,platform:'xbox',kills:200-i,wins:5+i,matches:120,
  kd:1.5,winRate:10,updatedAt:'2026-11-03T20:00:00Z',
  advanced:{damage:18000+i*100,assists:40,revives:15,top10:25},
  modes:Object.fromEntries(modes.map(m=>[m,{
   roundsPlayed:30,kills:35,wins:4,damageDealt:6500,
   assists:12,revives:4,top10s:7
  }]))
 })),
 roster:{total:55,verified:55,entries:members,states:{}},
 totals:{kills:10000,wins:300,matches:6000},platforms:{xbox:55,psn:0},
 modeOrder:modes,modeTotals:Object.fromEntries(modes.map(m=>[m,{
  matches:1000,kills:2000,wins:50,damage:55000,assists:150
 }])),lastSync:'2026-11-03T20:00:00Z'
};
const health={status:'ok',last_sync_attempt:'2026-11-03T20:00:00Z',
 season_collection:{latest_result:null,last_finished_at:null},
 cache_health:{schemaVersion:1,checkedAt:'2026-11-04T00:30:00Z',
  cache:{total:8,fresh:4,expired:4,newestFetchedAt:'2026-11-03T20:00:00Z',
   byCategory:{matches:3,player_profiles:1}},
  budget:{reservations:2,limit:10,windowSeconds:65},
  observations:{lifetimePlayers:51,seasonPlayers:1,seasonAttempts:0}}
};
function reply(res,code,body){
 res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});
 res.end(JSON.stringify(body));
}
const server=http.createServer(async(req,res)=>{
 const uri=new URL(req.url,'http://127.0.0.1');
 // Vercel serves this analytics route in production; it is intentionally inert
 // in the offline Chrome fixture. Chrome also probes favicon.ico automatically.
 if(uri.pathname==='/_vercel/insights/script.js'){
  res.writeHead(204,{'Content-Type':'text/javascript'});res.end();return;
 }
 if(uri.pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}

 if(uri.pathname==='/api/public-stats')return reply(res,200,fixture);
 if(uri.pathname==='/api/health')return reply(res,200,health);
 if(uri.pathname==='/api/public-insights'&&uri.searchParams.get('kind')==='survival')
  return reply(res,200,{schemaVersion:1,kind:'survival',name:members[0].name,
   platform:'xbox',savedAt:'2026-11-03T20:00:00Z',
   stats:{xp:14000,tier:2,level:75,totalMatchesPlayed:240}});
 if(uri.pathname==='/api/public-matches')
  return reply(res,200,{schemaVersion:1,matches:[],count:0});
 // Other pages may read optional endpoints: return a benign synthetic empty
 // payload rather than polluting the Chrome console with fixture 404 errors.
 if(uri.pathname==='/api/public-insights'&&uri.searchParams.get('route')==='clan-weapons')
  return reply(res,200,{
    schemaVersion:1,kind:'clan-weapons',verifiedMembers:2,resolvedConsoleAccounts:2,
    cachedMasteryPlayers:2,contributingPlayers:2,oldestSavedAt:'2026-11-05T10:00:00Z',
    newestSavedAt:'2026-11-07T09:00:00Z',
    note:'Real saved, source-isolated clan weapon report, no PUBG requests',
    weapons:[
      {name:'M416',playersWithRecord:2,sources:{
        official:{players:2,metrics:{
          kills:{value:31,observed:2},damage:{value:3300,observed:2},
          headshots:{value:5,observed:1},longestKill:{value:340,observed:2}},
          leaders:[{name:'Sample Member',platform:'xbox',kills:20,damage:2050},
            {name:'Teammate',platform:'psn',kills:11,damage:1250}]},
        competitive:{players:2,metrics:{kills:{value:9,observed:2}},
          leaders:[{name:'Teammate',platform:'psn',kills:6}]},
        total:{players:2,metrics:{kills:{value:1600,observed:2}},leaders:[]}
      }},
      {name:'BerylM762',playersWithRecord:1,sources:{
        official:{players:1,metrics:{kills:{value:0,observed:1}},
          leaders:[{name:'Sample Member',platform:'xbox',kills:0}]},
        competitive:{players:0,metrics:{},leaders:[]},
        total:{players:1,metrics:{kills:{value:100,observed:1}},leaders:[]}
      }}
    ]
  });
 if(uri.pathname.startsWith('/api/'))return reply(res,200,{
  schemaVersion:1,items:[],matches:[],rows:[],entries:[],error:'No synthetic records'
 });
 const uriPath=(uri.pathname==='/'||uri.pathname==='/dashboard/'||uri.pathname==='/training/')?'/training/index.html':path.posix.normalize(uri.pathname);
 if(uriPath.includes('..')||!(/^\/(?:assets|design|training)\/[\w./-]+$/.test(uriPath)))
   return reply(res,404,{error:'Invalid asset'});
 try{
  const file=path.join(root,uriPath.substring(1)),bytes=await fs.readFile(file);
  const ext=path.extname(file),types={
   '.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml'
  };
  res.writeHead(200,{'Content-Type':types[ext]||'text/plain'});
  res.end(bytes);
 }catch(error){reply(res,404,{error:'Asset unavailable'});}
});
async function click(page,name){
 await page.locator('[data-page="'+name+'"]').click();
 await page.locator('#page-'+name).waitFor({state:'visible',timeout:5000});
}
async function run(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try{
  browser=await chromium.launch({channel:'chrome',headless:true,
   args:['--no-sandbox','--disable-dev-shm-usage']});
  for(const width of [1280,390]){
   const errors=[],page=await browser.newPage({viewport:{width,height:850}});
   page.on('pageerror',e=>errors.push(e.message));
   page.on('console',e=>{if(e.type()==='error')errors.push(e.text());});
   page.on('response',response=>{
    if(response.status()>=400 && response.url().startsWith('http://127.0.0.1:'))
      errors.push('HTTP '+response.status()+' '+response.url());
   });
   const response=await page.goto('http://127.0.0.1:'+server.address().port+'/dashboard/',{
    waitUntil:'networkidle'});
   assert.equal(response.status(),200);
   await page.locator('#notice').waitFor({state:'hidden',timeout:12000});
   const barHeight=await page.locator('#overview-chart .bar-actual').first()
    .evaluate(el=>parseFloat(getComputedStyle(el).height));
   assert.ok(barHeight>2,'Chart bars must render at real numeric heights under strict CSP');
   for(const tab of ['overview','leaderboard','players','modes','full-stats','matches',
    'weapons','season','teammates','compare','awards','analysis',
    'data-tools','help','survival','sources','global','health','roadmap'])
    await click(page,tab);
   await click(page,'players');
   assert.equal(await page.locator('#roster-table tr').count(),20);
   await page.locator('#roster-next').click();
   assert.match(await page.locator('#roster-page-label').innerText(),/Page 2 of 3/);
   await click(page,'awards');
   assert.match(await page.locator('#cc-awards-grid').innerText(),/Sharpshooter/);
   await click(page,'health');
   await page.waitForFunction(()=>document.getElementById('health-metrics')
    .textContent.includes('Shared PUBG reservations'));
   assert.match(await page.locator('#health-metrics').innerText(),/2 \/ 10/);
   await click(page,'sources');
   assert.ok(await page.locator('#dictionary-kind option').count()>0);
   await click(page,'survival');

   await click(page,'weapons');
   await page.locator('#clan-weapon-load').click();
   await page.waitForFunction(()=>document.getElementById('clan-weapon-rows')?.textContent.includes('M416'));
   assert.match(await page.locator('#clan-weapon-coverage').innerText(),/Saved mastery responses: 2/);
   assert.match(await page.locator('#clan-weapon-leaders').innerText(),/Sample Member/);

   await page.waitForFunction(()=>document.getElementById('survival-data')
    .textContent.includes('14,000'));
   assert.deepEqual(errors,[],'Browser console errors at '+width+'px');
   console.log('CHROME PASS: '+width+'px; 19 tabs, roster pagination, awards, health, dictionary, survival');
   await page.close();
  }
  console.log('REAL CHROME SMOKE PASS; only local synthetic API fixtures');
 }finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
 }
}
run().catch(e=>{console.error(e);process.exitCode=1;});
