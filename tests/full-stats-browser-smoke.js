'use strict';
// Actual Chrome smoke for /dashboard/, not the older embedded training dashboard.
// Uses synthetic responses; it never spends PUBG API calls or needs credentials.
const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..');
const modes=['solo','duo','squad','solo-fpp','duo-fpp','squad-fpp'];
const person={name:'Sample Member',platform:'xbox',kills:7,wins:1,matches:15,
 kd:7/15,winRate:100/15,updatedAt:'2026-11-05T12:00:00Z',
 modes:{solo:{roundsPlayed:5,kills:2,wins:0,damageDealt:800,longestKill:380,dailyKills:1,headshotKills:1},
 squad:{roundsPlayed:10,kills:5,wins:1,damageDealt:2000,longestKill:220,dailyKills:3,headshotKills:2}}};
const outsider={...person,name:'Outside Player',platform:'psn',kills:9,wins:2,
 modes:{squad:{roundsPlayed:12,kills:9,wins:2,dailyKills:4,longestKill:90}}};
const summary={schemaVersion:1,players:[person],modeOrder:modes,
 roster:{total:1,verified:1,entries:[{name:person.name,platform:'xbox',verified:true,status:'matched'}],
  states:{matched:1}},totals:{kills:7,wins:1,matches:15},
 platforms:{xbox:1,psn:0},lastSync:person.updatedAt,
 modeTotals:Object.fromEntries(modes.map(m=>[m,{matches:0,kills:0,wins:0,damage:0,assists:0}]))};
function respond(res,status,payload){
 res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(payload));
}
const server=http.createServer(async(req,res)=>{
 const uri=new URL(req.url,'http://127.0.0.1');
 if(uri.pathname==='/api/public-progress'){
  const days=Number(uri.searchParams.get('days')||3);
  const previous=days===1?'2026-11-06T12:00:00Z':
   days===3?'2026-11-04T12:00:00Z':null;
  const now='2026-11-07T12:00:00Z';
  const bounds=days===1?[0.75,1.5]:days===3?[2,4]:
   days===7?[6,9]:[12,17];
  const item=(player,kills,wins,matches,oldKills,oldWins,oldMatches,prior=previous)=>({
   player_name:player,platform:'xbox',latest_at:now,previous_at:prior,
   latest_kills:kills,latest_wins:wins,latest_matches:matches,
   previous_kills:oldKills,previous_wins:oldWins,previous_matches:oldMatches
  });
  const raw=[
   item('Sample Member',140,9,62,120,7,55),
   item('Alpha',80,4,54,68,4,50),
   item('Reset',1,1,2,100,8,51),
   item('Baseline',10,1,10,null,null,null,null)
  ];
  return respond(res,200,{
   schemaVersion:1,kind:'observed-progress',windowDays:days,
   minDays:bounds[0],maxDays:bounds[1],
   source:'Genuine official PUBG lifetime counter snapshots',
   comparedPlayers:previous?3:0,awaitingComparison:previous?1:4,
   note:'Actual saved snapshot comparisons only.',
   count:4,rows:raw.map(r=>({
    name:r.player_name,platform:r.platform,latestAt:r.latest_at,
    previousAt:r.previous_at,
    latestKills:r.latest_kills,latestWins:r.latest_wins,
    latestMatches:r.latest_matches,
    previousKills:r.previous_at?r.previous_kills:null,
    previousWins:r.previous_at?r.previous_wins:null,
    previousMatches:r.previous_at?r.previous_matches:null
   }))
  });
 }
 if(uri.pathname==='/api/health'){
  const collection=uri.searchParams.get('collection')==='1';
  const scopes=['lifetime','profile','weapons','survival'].map(scope=>({
   scope,total:50,done:scope==='profile'?48:50,
   pending:scope==='profile'?2:0,leased:0,unavailable:0,
   readyForRetry:scope==='profile'?2:0,pendingOlderThan48h:0,
   lastAttemptAt:'2026-11-07T05:47:23Z',
   lastCompletedAt:'2026-11-07T05:47:25Z'
  }));
  return respond(res,200,{
   status:'ok',last_sync_attempt:'2026-11-07T05:00:00Z',
   cache_health:{schemaVersion:1,checkedAt:'2026-11-07T09:30:00Z',
    cache:{total:1800,fresh:400,expired:1400,
     newestFetchedAt:'2026-11-07T05:47:25Z',
     byCategory:{matches:1497,player_profiles:50}},
    budget:{reservations:2,limit:8,windowSeconds:65,lastReservedAt:null},
    observations:{lifetimePlayers:51,seasonPlayers:2,seasonAttempts:0},
    notice:'Reservations do not guarantee live responses.'},
   season_collection:{latest_result:null,last_finished_at:null},
   ...(collection?{collection_health:{
    schemaVersion:1,checkedAt:'2026-11-07T09:30:00Z',
    players:{verified:50,checked:50,checkedWithin24h:50,
     checkedWithin48h:50,checkedOlderThan48h:0,neverChecked:0,
     latestCheckedAt:'2026-11-07T03:28:13Z',
     oldestCheckedAt:'2026-11-07T03:18:48Z'},
    archive:{playerMatchObservations:1772,observedPlayers:39,
     distinctMatches:1497,writesWithin24h:1772,
     lastWrittenAt:'2026-11-07T05:47:25Z',
     lastMatchPlayedAt:'2026-11-07T02:56:18Z'},
    scopes,season:{tracked:0,attemptedWithin24h:0,
     completedWithin24h:0,lastAttemptAt:null,lastCompletedAt:null},
    note:'Last checked is not a fresh upstream response.'
   }}:{})
  });
 }
 if(uri.pathname==='/api/public-stats')return respond(res,200,summary);
 if(uri.pathname==='/api/player-lookup')return respond(res,200,{
  schemaVersion:1,found:true,isClanMember:false,player:outsider});
 if(uri.pathname==='/api/public-matches'&&uri.searchParams.get('route')==='opponents'){
  const selected=uri.searchParams.get('opponent'),span=Number(uri.searchParams.get('days')||30);
  const common={schemaVersion:1,windowDays:span,filterMap:uri.searchParams.get('map')||'',
   filterMode:uri.searchParams.get('mode')||'',sort:uri.searchParams.get('sort')||'matches',
   name:'Sample Member',platform:'xbox',savedMatchesScanned:4,fullLobbiesFound:3,
   lobbyReportsVerified:3,lobbyReportsClassified:3,matchesIncluded:3,
   opponentAppearances:5,opponentNames:2,opponentsReturned:2,
   mapOptions:['Baltic_Main','Desert_Main'],modeOptions:['squad','duo'],
   source:'180-day official saved full-match archive',
   note:'Official PUBG lobby participants from verified different rosters. Names are visible labels only.'};
  if(selected)return respond(res,200,{...common,kind:'lobby-opponent-detail',
   opponent:selected,observationsAvailable:2,observationsReturned:2,
   observations:[{matchId:'00336e4b-d659-4497-bfc4-9f6dd705cc71',
    playedAt:'2026-11-05T14:00:00Z',map:'Baltic_Main',mode:'squad',
    opponentKills:8,opponentDamage:900,opponentPlacement:1,
    playerKills:7,playerDamage:800,playerPlacement:2},
    {matchId:'00336e4b-d659-4497-bfc4-9f6dd705cc72',
    playedAt:'2026-11-04T14:00:00Z',map:'Desert_Main',mode:'duo',
    opponentKills:2,opponentDamage:null,opponentPlacement:12,
    playerKills:1,playerDamage:250,playerPlacement:15}]});
  return respond(res,200,{...common,kind:'lobby-opponent-scout',
   opponents:[{name:'Rival Player',matchesObserved:2,participantAppearances:2,
    kills:10,killsObserved:2,damage:900,damageObserved:1,bestPlacement:1,
    latestMatchAt:'2026-11-05T14:00:00Z',nameCollisionMatches:0},
   {name:'Another Opponent',matchesObserved:1,participantAppearances:1,
    kills:null,killsObserved:0,damage:null,damageObserved:0,bestPlacement:12,
    latestMatchAt:'2026-11-04T14:00:00Z',nameCollisionMatches:0}]});
 }
 if(uri.pathname==='/api/public-matches'&&uri.searchParams.get('route')==='lobby')
  return respond(res,200,{
   schemaVersion:1,kind:'match-lobby',matchId:'00336e4b-d659-4497-bfc4-9f6dd705cc71',
   player:'Sample Member',platform:'xbox',
   map:'Baltic_Main',mode:'squad',matchType:'official',
   playedAt:'2026-11-05T14:00:00Z',savedAt:'2026-11-07T09:00:00Z',
   durationSeconds:1811,playersShown:4,participantsInSource:4,
   teamsShown:3,ownTeamPosition:2,note:'Actual saved PUBG match participant and roster data',
   teams:[
    {displayIndex:1,placement:1,isOwnTeam:false,assignedRoster:true,
     kills:{value:8,observed:1},damage:{value:900,observed:1},
     knocks:{value:4,observed:1},
     players:[{name:'Opponent',placement:1,kills:8,damage:900,knocks:4,
      assists:1,headshots:3,timeSurvivedSeconds:1800,deathType:'alive',isSelf:false}]},
    {displayIndex:2,placement:2,isOwnTeam:true,assignedRoster:true,
     kills:{value:10,observed:2},damage:{value:950,observed:2},
     knocks:{value:5,observed:2},
     players:[{name:'Sample Member',placement:2,kills:7,damage:800,
       knocks:4,assists:2,headshots:2,timeSurvivedSeconds:1700,
       deathType:'byzone',isSelf:true},
      {name:'Friendly',placement:2,kills:3,damage:150,knocks:1,
       assists:0,headshots:1,timeSurvivedSeconds:1500,
       deathType:'byplayer',isSelf:false}]},
    {displayIndex:3,placement:null,isOwnTeam:false,assignedRoster:false,
     kills:{value:null,observed:0},damage:{value:null,observed:0},
     knocks:{value:null,observed:0},
     players:[{name:'Unassigned',placement:null,kills:null,damage:null,
      knocks:null,assists:null,headshots:null,timeSurvivedSeconds:null,
      deathType:null,isSelf:false}]}
   ]
  });
 if(uri.pathname==='/api/public-matches'&&uri.searchParams.get('route')==='clan-activity'){
  const span=Number(uri.searchParams.get('days')||30);
  const rows=Array.from({length:span},(_,i)=>{
   const day=new Date(Date.UTC(2026,10,7-(span-1-i))).toISOString().slice(0,10);
   const games=i%6===0?0:(i%5)+2;
   const observations=games*2;
   return{day,distinctMatches:games,playerMatches:observations,
    activePlayers:games?2:0,playerWins:games?1:0,
    knownPlacements:observations,playerTop10:games?2:0,
    killsObserved:observations,kills:games*4,
    damageObserved:observations,damage:games*123.25};
  });
  const sum=field=>rows.reduce((n,r)=>n+r[field],0);
  return respond(res,200,{
   schemaVersion:1,kind:'clan-activity',periodDays:span,timeZone:'UTC',
   generatedAt:'2026-11-07T08:30:00Z',verifiedPlayers:50,
   observedPlayers:14,playerMatchObservations:sum('playerMatches'),
   distinctMatches:sum('distinctMatches'),
   firstMatchAt:'2026-10-22T06:56:48Z',lastMatchAt:'2026-11-07T02:56:18Z',
   days:rows,note:'Saved player matches, not all actual clan games.'
  });
 }
 if(uri.pathname==='/api/public-matches'&&uri.searchParams.get('route')==='clan-records'){
  const days=Number(uri.searchParams.get('days')||30);
  const record=(metric,rank,value,name='Sample Member')=>({
   metric,rank,value,name,platform:name==='Alpha'?'psn':'xbox',
   map:'Baltic_Main',mode:'squad',playedAt:'2026-11-06T12:00:00Z'
  });
  return respond(res,200,{
   schemaVersion:1,kind:'clan-match-records',periodDays:days,
   generatedAt:'2026-11-07T07:00:00Z',
   verifiedPlayers:50,observedPlayers:39,
   playerMatchObservations:1772,distinctMatches:1500,
   coverage:[
    {metric:'kills',observed:1772},{metric:'damage',observed:1772},
    {metric:'headshots',observed:1600},{metric:'assists',observed:1598},
    {metric:'knocks',observed:1650},{metric:'revives',observed:1550},
    {metric:'longestKillMeters',observed:1600},
    {metric:'timeSurvivedSeconds',observed:1559},
    {metric:'roadKills',observed:1600},
    {metric:'vehicleDestroys',observed:1650}
   ],
   records:[
    record('kills',1,35),record('kills',2,28,'Alpha'),
    record('damage',1,4241.46,'Alpha'),
    record('headshots',1,11),
    record('assists',1,8),
    record('knocks',1,14),
    record('revives',1,3),
    record('longestKillMeters',1,370.2),
    record('timeSurvivedSeconds',1,1851),
    record('roadKills',1,2),
    record('vehicleDestroys',1,3)
   ]
  });
 }
 if(uri.pathname==='/api/public-matches'&&uri.searchParams.get('route')==='clan-board'){
  const days=Number(uri.searchParams.get('days')||30);
  return respond(res,200,{schemaVersion:1,kind:'clan-match-board',periodDays:days,
   generatedAt:'2026-11-07T06:00:00Z',clanPlayers:50,observedPlayers:3,
   playerMatchObservations:12,distinctMatches:9,
   note:'Only verified archived match records',rows:[
    {name:'Alpha',platform:'xbox',map:'Baltic_Main',mode:'squad',
     latest:'2026-11-07T03:00:00Z',games:4,placed:4,wins:1,top10:2,
     killsObserved:4,kills:12,damageObserved:4,damage:1400,
     assistsObserved:4,assists:4,knocksObserved:4,knocks:5,
     survivalObserved:4,survivalSeconds:4800,placementTotal:28},
    {name:'Beta',platform:'psn',map:'Baltic_Main',mode:'squad',
     latest:'2026-11-07T04:00:00Z',games:5,placed:5,wins:1,top10:4,
     killsObserved:5,kills:10,damageObserved:5,damage:1000,
     assistsObserved:5,assists:2,knocksObserved:5,knocks:4,
     survivalObserved:5,survivalSeconds:4000,placementTotal:22},
    {name:'Alpha',platform:'xbox',map:'Desert_Main',mode:'solo',
     latest:'2026-11-07T05:00:00Z',games:2,placed:2,wins:0,top10:1,
     killsObserved:2,kills:2,damageObserved:2,damage:200,
     assistsObserved:2,assists:0,knocksObserved:2,knocks:0,
     survivalObserved:0,survivalSeconds:0,placementTotal:20},
    {name:'NoSample',platform:'xbox',map:'Desert_Main',mode:'duo',
     latest:'2026-11-06T02:00:00Z',games:1,placed:0,wins:0,top10:0,
     killsObserved:0,kills:0,damageObserved:0,damage:0,
     assistsObserved:0,assists:0,knocksObserved:0,knocks:0,
     survivalObserved:0,survivalSeconds:0,placementTotal:0}
   ]});
 }
 if(uri.pathname==='/api/public-matches'&&uri.searchParams.get('route')==='rivals'){
  const opponent=uri.searchParams.get('opponent');
  const map=uri.searchParams.get('map')||'';
  const days=Number(uri.searchParams.get('days')||0);
  const named=[
   {name:'Rival Player',matchesSampled:2,kills:2,deaths:1,
    damageDealt:145,damageTaken:85,damageDealtObserved:2,
    damageTakenObserved:2,lastMatchAt:'2026-11-06T13:00:00Z'},
   {name:'Second Rival',matchesSampled:1,kills:0,deaths:1,
    damageDealt:null,damageTaken:44,damageDealtObserved:0,
    damageTakenObserved:1,lastMatchAt:'2026-11-05T13:00:00Z'}
  ];
  return respond(res,200,{
   schemaVersion:2,player:'Sample Member',platform:'xbox',
   matchesScanned:4,matchesAnalysed:map?1:3,undatedMatches:0,
   opponentNames:map?1:2,latestSavedAt:'2026-11-07T11:00:00Z',
   filterDays:days,filterMap:map,filterMode:uri.searchParams.get('mode')||'',
   selectedOpponent:opponent,
   mapOptions:['Baltic_Main','Desert_Main'],modeOptions:['squad','solo'],
   rivals:map?[named[0]]:named,encountersReturned:opponent?2:0,
   encountersAvailable:opponent?2:0,
   encounters:opponent?[
    {map:'Baltic_Main',mode:'squad',playedAt:'2026-11-06T13:00:00Z',
     kills:2,deaths:0,damageDealt:145,damageTaken:null},
    {map:'Desert_Main',mode:'solo',playedAt:'2026-11-05T13:00:00Z',
     kills:0,deaths:1,damageDealt:null,damageTaken:85}
   ]:[],
   note:'Only genuine analysed PUBG telemetry events; visible names unverified.'
  });
 }
 if(uri.pathname==='/api/public-matches')return respond(res,200,{
  schemaVersion:1,name:'Sample Member',platform:'xbox',
  source:'Private 180-day archive',archivedCount:4,availableCount:4,
  note:'Synthetic saved matches for browser testing',
  matches:[
   {id:'00336e4b-d659-4497-bfc4-9f6dd705cc71',map:'Baltic_Main',
    mode:'squad',playedAt:'2026-11-05T14:00:00Z',placement:1,
    kills:5,damage:800,headshots:2,knocks:4,assists:2,
    timeSurvivedSeconds:1851,swimMeters:187.6,killPlace:3,
    killStreaks:2,roadKills:1,teamKills:0,vehicleDestroys:2,
    weaponsAcquired:14,deathType:'byzone',
    squad:[{name:'Sample Member',isSelf:true,kills:5,damage:800,assists:2,
      timeSurvivedSeconds:1851,headshots:2,revives:1},
     {name:'Friend',kills:3,damage:250,assists:1,headshots:1,revives:2}]},
   {id:'00336e4b-d659-4497-bfc4-9f6dd705cc72',map:'Baltic_Main',
    mode:'squad',playedAt:'2026-11-04T14:00:00Z',placement:12,kills:0,damage:50,
    squad:[{name:'Sample Member',isSelf:true,kills:0}]},
   {id:'00336e4b-d659-4497-bfc4-9f6dd705cc73',map:'Desert_Main',
    mode:'solo',playedAt:'2026-11-03T14:00:00Z',placement:7,kills:3,damage:450},
   {id:'00336e4b-d659-4497-bfc4-9f6dd705cc74',map:'Desert_Main',
    mode:'duo',playedAt:'2026-11-02T14:00:00Z',placement:null,
    kills:null,damage:null}
  ]});
 if(uri.pathname==='/api/public-insights'&&uri.searchParams.get('kind')==='teammates')
  return respond(res,200,{schemaVersion:1,kind:'teammates',name:'Sample Member',
    platform:'xbox',archivedMatches:5,count:3,
    note:'Saved squad rosters only; no large telemetry report loaded.',
    items:[
     {name:'Mate A',games:4,knownPlacements:3,wins:1,top10:2,
      winRate:100/3,top10Rate:200/3,
      kills:8,killsObserved:4,damage:1200,damageObserved:4,
      assists:3,assistsObserved:4,knocks:4,knocksObserved:4,
      myKills:12,myKillsObserved:4,pairedKills:20,pairedObserved:4,
      pairKillsPerMatch:5,lastPlayedAt:'2026-11-07T01:00:00Z',
      maps:[{name:'Baltic_Main',games:3},{name:'Desert_Main',games:1}],
      modes:[{name:'squad',games:4}]},
     {name:'Mate B',games:2,knownPlacements:1,wins:0,top10:1,
      winRate:0,top10Rate:100,kills:4,killsObserved:2,
      damage:500,damageObserved:2,assists:0,assistsObserved:2,
      knocks:1,knocksObserved:2,myKills:3,myKillsObserved:2,
      pairedKills:7,pairedObserved:2,pairKillsPerMatch:3.5,
      maps:[{name:'Baltic_Main',games:2}],modes:[{name:'squad',games:2}]},
     {name:'Mate C',games:1,knownPlacements:0,wins:0,top10:0,
      winRate:null,top10Rate:null,kills:null,killsObserved:0,
      damage:null,damageObserved:0,assists:null,assistsObserved:0,
      knocks:null,knocksObserved:0,myKills:null,myKillsObserved:0,
      pairedKills:null,pairedObserved:0,pairKillsPerMatch:null,
      maps:[{name:'Sanhok_Main',games:1}],modes:[{name:'duo',games:1}]}
    ]});
 if(uri.pathname==='/api/public-insights'&&uri.searchParams.get('kind')==='weapons')
  return respond(res,200,{schemaVersion:1,kind:'weapons',name:'Sample Member',
   platform:'xbox',savedAt:'2026-11-05T12:00:00Z',count:2,
   note:'Saved genuine PUBG mastery — separate source fields',
   items:[
    {name:'BerylM762',level:34,tier:4,xp:8000,
     official:{kills:8,headshots:3,damage:800,longestKill:295,
      mostDefeatsInGame:5},competitive:{kills:2},
     total:{kills:550,damage:65000,mostDamageInGame:2400,
      mostHeadshotsInGame:8,mostKnocksInGame:7,longRangeDefeats:12}},
    {name:'M416',level:22,tier:3,xp:30000,
     official:{kills:31,headshots:12,damage:3000,longestKill:210},
     competitive:{kills:5},total:{kills:3,damage:500}}
   ]});
 if(uri.pathname==='/api/public-insights'&&uri.searchParams.get('route')==='clan-weapons')
  return respond(res,200,{
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
 if(uri.pathname.startsWith('/api/'))return respond(res,200,{
  schemaVersion:1,items:[],history:[],matches:[],rows:[],points:[]});
 if(uri.pathname==='/favicon.ico'){res.writeHead(204);return res.end();}
 let file;
 if(uri.pathname==='/dashboard/'||uri.pathname==='/dashboard')file='index.html';
 else if(/^\/assets\/[\w./-]+$/.test(uri.pathname)&&
  !uri.pathname.includes('..'))file=uri.pathname.slice(1);
 else return respond(res,404,{error:'No matching static fixture'});
 try{
  const buf=await fs.readFile(path.join(root,file));
  const ext=path.extname(file),mime={'.html':'text/html','.js':'text/javascript',
   '.css':'text/css','.svg':'image/svg+xml'};
  res.writeHead(200,{'Content-Type':mime[ext]||'application/octet-stream'});
  res.end(buf);
 }catch(e){respond(res,404,{error:'Static fixture missing'});}
});
async function run(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try{
  browser=await chromium.launch({channel:'chrome',headless:true,
   args:['--no-sandbox','--disable-dev-shm-usage']});
  for(const width of [1280,390]){
   const page=await browser.newPage({viewport:{width,height:850}});
   const errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   page.on('console',e=>{if(e.type()==='error')errors.push(e.text());});
   page.on('response',r=>{if(r.status()>=400&&r.url().startsWith('http://127.0.0.1:'))
    errors.push('HTTP '+r.status()+' '+r.url());});
   const response=await page.goto('http://127.0.0.1:'+server.address().port+
    '/dashboard/',{waitUntil:'networkidle'});
   assert.equal(response.status(),200);
   await page.locator('#notice').waitFor({state:'hidden',timeout:12000});
   await page.locator('[data-page="full-stats"]').click();
   await page.locator('#page-full-stats').waitFor({state:'visible'});
   assert.equal(await page.locator('#full-player option').count(),1);
   assert.match(await page.locator('#full-source').innerText(),/Sample Member/);
   await page.locator('[data-page="teammates"]').click();
   await page.locator('#page-teammates').waitFor({state:'visible'});
   await page.waitForFunction(()=>document.getElementById('teammates-coverage')
    ?.textContent.includes('3 distinct visible teammate names'),{timeout:12000});
   assert.equal(await page.locator('#teammates-table tr').count(),3);
   assert.match(await page.locator('#teammates-table tr').first().innerText(),/Mate A/);
   assert.match(await page.locator('#teammates-coverage').innerText(),/5 saved match reports/);
   await page.locator('#teammates-min').selectOption('2');
   assert.equal(await page.locator('#teammates-table tr').count(),2);
   await page.locator('#teammates-sort').selectOption('winRate');
   assert.match(await page.locator('#teammates-table tr').first().innerText(),/Mate A/);
   await page.locator('#teammates-partner').selectOption('Mate A');
   assert.match(await page.locator('#teammates-detail').innerText(),/Erangel/);
   assert.match(await page.locator('#teammates-detail').innerText(),/5? games|4 games/);
   const duoBar=await page.locator('#teammates-bars [data-width]').first()
    .evaluate(el=>parseFloat(el.style.width));
   assert.ok(duoBar>0,'Squad bars use real CSSOM width without canvas');
   await page.locator('#teammates-search').fill('Mate B');
   assert.equal(await page.locator('#teammates-table tr').count(),1);
   await page.locator('#teammates-search').fill('');
   await page.locator('#teammates-min').selectOption('1');
   assert.equal(await page.locator('#teammates-table tr').count(),3);
   // The awards view is archive-only: no telemetry request or PUBG fetch.
   await page.locator('[data-page="awards"]').click();
   await page.locator('#page-awards').waitFor({state:'visible'});
   await page.waitForFunction(()=>document.getElementById('clan-record-status')
    ?.textContent.includes('Read-only saved PUBG record book ready'),{timeout:12000});
   await page.waitForFunction(()=>document.getElementById('cc-momentum-note')
    ?.textContent.includes('verified players have actual snapshot pairs'),{timeout:12000});
   assert.equal(await page.locator('#cc-momentum-grid .cc-award').count(),4);
   assert.match(await page.locator('#cc-momentum-note').innerText(),/2 have 3\+ newly recorded games/);
   assert.match(await page.locator('#cc-momentum-grid').innerText(),/Sample Member/);
   assert.match(await page.locator('#cc-momentum-grid').innerText(),/20/);
   await page.locator('#cc-momentum-window').selectOption('7');
   await page.waitForFunction(()=>document.getElementById('cc-momentum-note')
    ?.textContent.includes('0 verified players have actual snapshot pairs'),{timeout:12000});
   assert.match(await page.locator('#cc-momentum-grid').innerText(),/No eligible real result/);
   await page.locator('#cc-momentum-window').selectOption('3');
   await page.waitForFunction(()=>document.getElementById('cc-momentum-note')
    ?.textContent.includes('3 verified players have actual snapshot pairs'),{timeout:12000});
   assert.match(await page.locator('#clan-record-kpis').innerText(),/1,500/);
   assert.equal(await page.locator('#clan-record-metrics button').count(),10);
   assert.equal(await page.locator('#clan-record-table tr').count(),2);
   assert.match(await page.locator('#clan-record-table tr').first().innerText(),/35/);
   assert.match(await page.locator('#clan-record-description').innerText(),/1,772/);
   await page.locator('#clan-record-metric').selectOption('damage');
   assert.match(await page.locator('#clan-record-table tr').first().innerText(),/4,241.5/);
   await page.locator('#clan-record-metrics [data-record-metric="timeSurvivedSeconds"]').click();
   assert.match(await page.locator('#clan-record-table tr').first().innerText(),/30m 51s/);
   assert.match(await page.locator('#clan-record-description').innerText(),/1,559/);
   await page.locator('#clan-record-days').selectOption('7');
   await page.waitForFunction(()=>document.getElementById('clan-record-status')
    ?.textContent.includes('7 days'),{timeout:12000});
   assert.equal(await page.locator('#clan-record-table tr').count(),1);
   await page.locator('#clan-record-days').selectOption('30');
   await page.waitForFunction(()=>document.getElementById('clan-record-status')
    ?.textContent.includes('30 days'),{timeout:12000});
   assert.match(await page.locator('#clan-record-description').innerText(),/not a career high/);
   await page.locator('[data-page="analysis"]').click();
   await page.locator('#page-analysis').waitFor({state:'visible'});
   await page.waitForFunction(()=>document.getElementById('cc-progress-note')
    ?.textContent.includes('players added genuine games'),{timeout:12000});
   assert.equal(await page.locator('#cc-progress-window').inputValue(),'3');
   assert.match(await page.locator('#cc-progress').innerText(),/Sample Member/);
   assert.match(await page.locator('#cc-progress').innerText(),/counter changed/);
   assert.match(await page.locator('#cc-progress').innerText(),/baseline only/);
   await page.locator('#cc-progress-window').selectOption('14');
   await page.waitForFunction(()=>document.getElementById('cc-progress-note')
    ?.textContent.includes('0 players added genuine games'),{timeout:12000});
   await page.locator('#cc-progress-window').selectOption('1');
   await page.waitForFunction(()=>document.getElementById('cc-progress-note')
    ?.textContent.includes('2 players added genuine games'),{timeout:12000});
   assert.match(await page.locator('#cc-progress').innerText(),/Sample Member/);
   await page.locator('[data-page="matches"]').click();
   await page.locator('#page-matches').waitFor({state:'visible'});
   await page.waitForFunction(()=>document.getElementById('match-map-table')?.
    textContent.includes('Erangel'),{timeout:12000});
   await page.waitForFunction(()=>document.getElementById('clan-board-status')
    ?.textContent.includes('Saved comparison ready'),{timeout:12000});
   await page.waitForFunction(()=>document.getElementById('clan-pulse-status')
    ?.textContent.includes('Saved activity ready'),{timeout:12000});
   assert.equal(await page.locator('#clan-pulse-chart button').count(),30);
   assert.match(await page.locator('#clan-pulse-kpis').innerText(),/50/);
   assert.match(await page.locator('#clan-pulse-coverage').innerText(),/partial day/);
   assert.equal(await page.locator('#clan-pulse-table tr').count(),30);
   assert.match(await page.locator('#clan-pulse-detail').innerText(),/Distinct active clan players/);
   await page.locator('#clan-pulse-metric').selectOption('kills');
   const pulseFill=await page.locator('#clan-pulse-chart .clan-pulse-fill')
    .evaluateAll(list=>Math.max(...list.map(el=>parseFloat(el.style.height)||0)));
   assert.ok(pulseFill>0,'Saved daily activity bars have measurable CSS-only heights');
   await page.locator('#clan-pulse-chart [data-pulse-index="0"]').click();
   assert.equal(await page.locator('#clan-pulse-chart [aria-pressed="true"]').count(),1);
   assert.match(await page.locator('#clan-pulse-detail').innerText(),/Reported kills/);
   await page.locator('#clan-pulse-days').selectOption('7');
   await page.waitForFunction(()=>document.getElementById('clan-pulse-status')
    ?.textContent.includes('7 UTC calendar days'),{timeout:12000});
   assert.equal(await page.locator('#clan-pulse-chart button').count(),7);
   assert.equal(await page.locator('#clan-pulse-table tr').count(),7);
   await page.locator('#clan-pulse-days').selectOption('180');
   await page.waitForFunction(()=>document.getElementById('clan-pulse-status')
    ?.textContent.includes('180 UTC calendar days'),{timeout:12000});
   assert.equal(await page.locator('#clan-pulse-chart button').count(),26);
   assert.match(await page.locator('#clan-pulse-detail').innerText(),/Active player-days/);
   await page.locator('#clan-pulse-chart [data-pulse-index="0"]').click();
   assert.equal(await page.locator('#clan-pulse-table tr').count(),7);
   assert.match(await page.locator('#clan-pulse-table-note').innerText(),/multiple player-days/);
   await page.locator('#clan-pulse-days').selectOption('30');
   await page.waitForFunction(()=>document.getElementById('clan-pulse-status')
    ?.textContent.includes('30 UTC calendar days'),{timeout:12000});
   assert.equal(await page.locator('#clan-board-table tr').count(),2);
   assert.match(await page.locator('#clan-board-kpis').innerText(),/50/);
   assert.match(await page.locator('#clan-board-note').innerText(),/not lifetime/i);
   assert.equal(await page.locator('#clan-board-map option[value="Baltic_Main"]').innerText(),'Erangel');
   await page.locator('#clan-board-map').selectOption('Baltic_Main');
   assert.equal(await page.locator('#clan-board-table tr').count(),2);
   await page.locator('#clan-board-sort').selectOption('winRate');
   assert.match(await page.locator('#clan-board-table tr').first().innerText(),/Alpha/);
   assert.match(await page.locator('#clan-board-table tr').first().innerText(),/25%/);
   await page.locator('#clan-board-min').selectOption('5');
   assert.equal(await page.locator('#clan-board-table tr').count(),1);
   assert.match(await page.locator('#clan-board-table tr').first().innerText(),/Beta/);
   await page.locator('#clan-board-min').selectOption('1');
   assert.equal(await page.locator('#clan-board-table tr').count(),2);
   await page.locator('#clan-board-compare-a').selectOption('xbox:alpha');
   await page.locator('#clan-board-compare-b').selectOption('psn:beta');
   assert.match(await page.locator('#clan-board-compare').innerText(),/Alpha/);
   assert.match(await page.locator('#clan-board-compare').innerText(),/Beta/);
   await page.locator('#clan-board-map').selectOption('');
   const mapWidth=await page.locator('#clan-board-map-bars [data-width]').first()
    .evaluate(el=>parseFloat(el.style.width));
   assert.ok(mapWidth>0,'Map distribution bars require a real CSSOM width');
   await page.locator('#clan-board-days').selectOption('7');
   await page.waitForFunction(()=>document.getElementById('clan-board-status')
    ?.textContent.includes('Saved comparison ready')&&
    document.getElementById('clan-board-note')?.textContent.includes('7-day'),
    {timeout:12000});
   assert.equal(await page.locator('#clan-board-table tr').count(),3);
   assert.equal(await page.locator('#clan-board-export').isDisabled(),false);

   assert.equal(await page.locator('#match-results article').count(),4);
   assert.match(await page.locator('#match-lab-coverage').innerText(),/4 of 4/);
   assert.match(await page.locator('#match-lab-coverage').innerText(),/NOT lifetime totals/);
   assert.match(await page.locator('#match-map-table').innerText(),/Erangel/);
   assert.match(await page.locator('#match-map-table').innerText(),/50%/);
   assert.equal(await page.locator('#match-map-filter option[value="Baltic_Main"]').innerText(),'Erangel');
   await page.locator('#match-map-filter').selectOption('Baltic_Main');
   assert.equal(await page.locator('#match-results article').count(),2);
   assert.match(await page.locator('#match-lab-coverage').innerText(),/2 of 4/);
   await page.locator('#match-outcome-filter').selectOption('win');
   assert.equal(await page.locator('#match-results article').count(),1);
   assert.match(await page.locator('#match-results').innerText(),/62.5%/);
   await page.locator('#match-results article').first().locator('.match-detail summary').click();
   const detail=await page.locator('#match-results article').first().locator('.match-detail').innerText();
   assert.match(detail,/30m 51s/);
   assert.match(detail,/Died to zone/);
   assert.match(detail,/187\.6 m/);
   assert.match(detail,/Weapons acquired/);
   assert.match(detail,/Vehicles destroyed/);
   assert.match(await page.locator('#match-lab-coverage').innerText(),/match survival records/);
   await page.locator('#match-trend-metric').selectOption('timeSurvivedSeconds');
   assert.match(await page.locator('#match-trend').innerText(),/1,851/);
   await page.locator('#match-trend-metric').selectOption('damage');
   assert.equal(await page.locator('#match-trend .match-trend-item').count(),1);
   const chartHeight=await page.locator('#match-trend [data-height]').first().evaluate(
    el=>parseFloat(el.style.height));
   assert.ok(chartHeight>0,'Saved match trend bars must have actual CSSOM heights');
   assert.equal(await page.locator('#telemetry-opt-in').getAttribute('open'),null);
   await page.locator('#match-results [data-combat-match]').first().click();
   assert.notEqual(await page.locator('#telemetry-opt-in').getAttribute('open'),null);

   assert.equal(await page.locator('#telemetry-match').inputValue(),
    '00336e4b-d659-4497-bfc4-9f6dd705cc71');

    await page.locator('#telemetry-rivals-refresh').click();
    await page.waitForFunction(()=>document.getElementById('telemetry-rivals-count')
     ?.textContent.includes('2 visible name'),{timeout:12000});
    assert.equal(await page.locator('#telemetry-rivals-table tr').count(),2);
    assert.match(await page.locator('#telemetry-rivals-note').innerText(),/3 distinct analysed matches/);
    assert.match(await page.locator('#telemetry-rivals-table').innerText(),/n=2/);
    await page.locator('#telemetry-rivals-search').fill('Rival Player');
    assert.equal(await page.locator('#telemetry-rivals-table tr').count(),1);
    await page.locator('#telemetry-rivals-search').fill('');
    await page.locator('[data-rival-name="Rival Player"]').click();
    await page.waitForFunction(()=>document.getElementById('telemetry-rival-detail')
     ?.textContent.includes('Miramar'),{timeout:12000});
    assert.match(await page.locator('#telemetry-rival-detail').innerText(),/unavailable, not zero/);
    await page.locator('#telemetry-rivals-days').selectOption('7');
    await page.waitForFunction(()=>document.getElementById('telemetry-rivals-note')
     ?.textContent.includes('Last 7 days'),{timeout:12000});
    assert.equal(await page.locator('#telemetry-rivals-map option[value="Desert_Main"]').innerText(),'Miramar');
    await page.locator('#telemetry-rivals-map').selectOption('Desert_Main');
    await page.waitForFunction(()=>document.getElementById('telemetry-rivals-count')
     ?.textContent.includes('1 visible name'),{timeout:12000});
    assert.equal(await page.locator('#telemetry-rivals-map').inputValue(),'Desert_Main');

   await page.locator('#match-map-filter').selectOption('');
   await page.locator('#match-outcome-filter').selectOption('unknown');
   assert.equal(await page.locator('#match-results article').count(),1);
   assert.match(await page.locator('#match-lab-summary').innerText(),/—/);
   await page.locator('#match-outcome-filter').selectOption('all');
   await page.locator('[data-page="full-stats"]').click();

   assert.match(await page.locator('#full-summary').innerText(),/7/);
   assert.match(await page.locator('#full-results').innerText(),/Longest kill/);
   await page.locator('#full-category').selectOption('Recent activity');
   assert.match(await page.locator('#full-results').innerText(),/Recent-day kills/);
   // Day/week counters must be unavailable in the all-mode view.
   assert.equal((await page.locator('tr').filter({has:page.locator('code', {hasText:'dailyKills'})})
    .locator('.full-stat-value').first().innerText()).trim(),'—');
   await page.locator('#full-mode').selectOption('squad');
   assert.equal((await page.locator('tr').filter({has:page.locator('code', {hasText:'dailyKills'})})
    .locator('.full-stat-value').first().innerText()).trim(),'3');
   await page.locator('#full-category').selectOption('Combat');
   await page.locator('#full-query').fill('longest');
   assert.match(await page.locator('#full-results').innerText(),/220 m/);
   await page.locator('#full-mode').selectOption('all');
   assert.match(await page.locator('#full-results').innerText(),/380 m/);
   await page.locator('#full-query').fill('');
   await page.locator('[data-page="players"]').click();
   await page.locator('#page-players [data-profile="Sample Member"]').click();
   await page.locator('#profile[open]').waitFor({state:'visible'});
   await page.locator('[data-full-stats]').click();
   await page.locator('#page-full-stats').waitFor({state:'visible'});
   assert.equal(await page.locator('#full-player').inputValue(),'Sample Member');
   await page.locator('[data-page="overview"]').click();
   await page.locator('#console-gamertag').fill('Outside Player');
   await page.locator('#console-search').click();
   await page.locator('#console-search-result [data-profile="Outside Player"]')
    .waitFor({state:'visible'});
   await page.locator('[data-page="full-stats"]').click();
   assert.equal(await page.locator('#full-player option').count(),2);
   await page.locator('#full-player').selectOption('Outside Player');
   assert.match(await page.locator('#full-source').innerText(),/PlayStation/);
   // Confirm the actual Weapon Mastery tab uses post-18.2 Official figures by default.
   await page.locator('[data-page="weapons"]').click();
   await page.locator('#page-weapons').waitFor({state:'visible'});
   await page.waitForFunction(()=>document.getElementById('weapon-detail')?.
    textContent.includes('Most kills in a match'),{timeout:12000});
   assert.equal(await page.locator('#weapon-category').inputValue(),'official');
   assert.match(await page.locator('#weapons-table tr').first().innerText(),/M416/);
   assert.match(await page.locator('#weapon-coverage').innerText(),/Official \(post-18\.2\)/);
   await page.locator('[data-weapon-select="BerylM762"]').click();
   assert.match(await page.locator('#weapon-detail').innerText(),/2,400/);
   assert.match(await page.locator('#weapon-detail').textContent(),/Legacy \(frozen at 18\.2\)/);
   await page.locator('#weapon-category').selectOption('total');
   assert.match(await page.locator('#weapons-table tr').first().innerText(),/BerylM762/);
   await page.locator('#weapon-sort').selectOption('xp');
   assert.match(await page.locator('#weapons-table tr').first().innerText(),/M416/);
   await page.locator('#weapon-search').fill('Beryl');
   assert.equal(await page.locator('#weapons-table tr').count(),1);
   assert.match(await page.locator('#weapon-summary').innerText(),/Weapons returned/);

   await page.locator('#clan-weapon-load').click();
   await page.waitForFunction(()=>document.getElementById('clan-weapon-rows')?.textContent.includes('M416'));
   assert.match(await page.locator('#clan-weapon-coverage').innerText(),/Saved mastery responses: 2/);
   assert.match(await page.locator('#clan-weapon-leaders').innerText(),/Sample Member/);
   await page.locator('#clan-weapon-source').selectOption('competitive');
   assert.match(await page.locator('#clan-weapon-rows').innerText(),/9/);
   await page.locator('#clan-weapon-search').fill('Beryl');
   assert.equal(await page.locator('#clan-weapon-rows tr').count(),1);
   await page.locator('#clan-weapon-search').fill('');


   await page.locator('[data-page="matches"]').click();
   await page.locator('#page-matches').waitFor({state:'visible'});
   await page.waitForFunction(()=>document.querySelector('[data-lobby-match]')!==null);
   await page.locator('#match-results [data-lobby-match]').first().click();
   assert.equal(await page.locator('#lobby-match').inputValue(),
    '00336e4b-d659-4497-bfc4-9f6dd705cc71');
   await page.locator('#lobby-load').click();
   await page.waitForFunction(()=>document.getElementById('lobby-player-table')?.
    textContent.includes('Opponent'));
   assert.equal(await page.locator('#lobby-team-table tr').count(),3);
   assert.equal(await page.locator('#lobby-player-table tr').count(),4);
   assert.match(await page.locator('#lobby-player-table').innerText(),/Sample Member/);
   assert.match(await page.locator('#lobby-team-table').innerText(),/YOUR SQUAD/);
   assert.match(await page.locator('#lobby-count').innerText(),/4 participants/);
   await page.locator('#lobby-team-scope').selectOption('mine');
   assert.equal(await page.locator('#lobby-team-table tr').count(),1);
   await page.locator('#lobby-search').fill('Friendly');
   assert.equal(await page.locator('#lobby-player-table tr').count(),1);
   assert.match(await page.locator('#lobby-player-table').innerText(),/Friendly/);
   assert.equal(await page.locator('#lobby-export').isEnabled(),true);
   await page.locator('#lobby-search').fill('');
   await page.locator('#lobby-team-scope').selectOption('all');

   await page.locator('#scout-load').click();
   await page.waitForFunction(()=>document.getElementById('scout-table')?.
    textContent.includes('Rival Player'),{timeout:12000});
   assert.equal(await page.locator('#scout-table tr').count(),2);
   assert.match(await page.locator('#scout-summary').innerText(),/Saved match references/);
   assert.match(await page.locator('#scout-status').innerText(),/saved full-match archive/);
   await page.locator('#scout-search').fill('Rival');
   assert.equal(await page.locator('#scout-table tr').count(),1);
   await page.locator('#scout-search').fill('');
   await page.locator('#scout-order').selectOption('damage');
   await page.waitForFunction(()=>document.getElementById('scout-status')?.
    textContent.includes('saved full-match archive'),{timeout:12000});
   assert.equal(await page.locator('#scout-map option[value="Baltic_Main"]').innerText(),'Erangel');
   await page.locator('#scout-map').selectOption('Baltic_Main');
   await page.waitForFunction(()=>document.getElementById('scout-table')?.
    textContent.includes('Rival Player'),{timeout:12000});
   await page.locator('[data-scout-name="Rival Player"]').click();
   await page.waitForFunction(()=>document.getElementById('scout-detail')?.
    textContent.includes('900'),{timeout:12000});
   assert.match(await page.locator('#scout-detail').innerText(),/whole-match totals/);
   assert.match(await page.locator('#scout-detail').innerText(),/Miramar/);
   assert.equal(await page.locator('#scout-export').isEnabled(),true);
   assert.equal(await page.locator('#telemetry-map').count(),0,
    'Scouting must never reintroduce the retired 2D replay map');


   await page.locator('[data-page="health"]').click();
   await page.locator('#page-health').waitFor({state:'visible'});
   await page.waitForFunction(()=>document.getElementById('health-backfill-table')?.
    textContent.includes('Recent-match index'),{timeout:12000});
   assert.match(await page.locator('#health-freshness-metrics').innerText(),/50/);
   assert.match(await page.locator('#health-freshness-metrics').innerText(),/1,497/);
   assert.match(await page.locator('#health-backfill-table').innerText(),/48 \/ 50/);
   assert.match(await page.locator('#health-backfill-note').innerText(),/2 clan tasks are pending/);
   assert.match(await page.locator('#health-archive-note').innerText(),/newest match played/);
   assert.match(await page.locator('#health-collection-note').innerText(),/No stale player-check/);
   assert.match(await page.locator('#health-season-collector').innerText(),/0 tracked clan players/);
   assert.match(await page.locator('#health-source-note').innerText(),/Reservations do not guarantee/);
   await page.locator('#health-refresh').click();
   await page.waitForFunction(()=>document.getElementById('health-backfill-note')?.
    textContent.includes('2 clan tasks are pending'),{timeout:12000});
   assert.deepEqual(errors,[],'Browser console errors at '+width+'px');
   console.log('FULL STATS CHROME PASS: '+width+'px; lifetime and source-correct mastery explorer');
   await page.close();
  }
 }finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
 }
}
run().catch(e=>{console.error(e);process.exitCode=1;});
