'use strict';
// Read-only Discord summaries of the same saved, source-verified data as the website.
// This module NEVER calls PUBG endpoints, triggers refresh jobs or creates a new
// serverless function. Large tables and detailed source drilldowns stay on web.
const {cachedPlayerMatches}=require('./web-match-intel');
const {recentForm}=require('../assets/match-lab');
const {publicRivalTrends}=require('./web-telemetry');
const {publicClanMatchBoard}=require('./web-clan-match-board');
const {opt,label}=require('./commands-core');

const SITE='https://pubg-help-clan.vercel.app/dashboard/';
const MATCHES=SITE+'#matches';
const FIELDS=new Set(['form','rivals','clan','scout','stats','weapons','awards','health']);
const PERIODS=new Set([0,7,30,180]);
const CLAN_PERIODS=new Set([7,30,180]);
const bounded=text=>String(text).slice(0,1850);
const numeric=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0?n:null;
const fmt=(n,dp=0)=>numeric(n)===null?'—':Number(n).toLocaleString('en-GB',{
 maximumFractionDigits:dp
});
const gamertag=body=>String(opt(body,'gamertag')).trim();
const playerName=name=>label(String(name||'Unknown player'));
function status(result,kind){
 if(result?.status===404)return 'No saved console account found. Try /stats first or search the web dashboard.';
 if(result?.status!==200)return 'Saved '+kind+' are unavailable right now. No PUBG refresh was attempted.';
 return null;
}
function metricLine(row){
 const now=fmt(row.now,row.digits),old=fmt(row.old,row.digits);
 const change=row.direction==='unavailable'?'— (incomplete sample)':
  row.direction==='same'?'no change':
  (row.difference>0?'+':'−')+fmt(Math.abs(row.difference),row.digits)+
  (row.direction==='better'?' ✅':' ↘');
 return '• **'+row.label+'** '+now+' vs '+old+' · '+change;
}
async function form(db,body){
 const name=gamertag(body);
 const response=await cachedPlayerMatches(db,name);
 const failed=status(response,'matches');
 if(failed)return failed;
 const data=response.body;
 const report=recentForm(data.matches);
 const counts=report.latestCount+'/10 latest · '+report.previousCount+'/10 previous';
 const stats=report.metrics.map(metricLine).join('\n');
 const source=data.archivedCount?
  'Previously saved match archive (up to 180 days)':
  'Previously cached PUBG match responses (limited coverage)';
 const caution=report.verdict==='Not enough history'?
  'At least 20 dated distinct saved games are needed to compare equal windows.':
  report.verdict==='Incomplete stats'?
  'Some fields are missing. Only complete metric changes can be compared.':
  'Direction is descriptive, not a skill rating; maps and modes can differ.';
 return bounded('📈 **Recent Form: '+playerName(data.name)+'**\n'+
  '**'+report.verdict+'** · '+counts+'\n'+stats+'\n'+
  '_'+source+'. '+caution+' Unarchived games are unknown, not zero._\n'+
  'Full sample and filters: '+MATCHES+' (choose this player).');
}
function rivalHighlight(title,record,metric){
 return record&&numeric(record[metric])>0?
  '• **'+title+':** '+playerName(record.name)+' · '+fmt(record[metric])+
  ' confirmed kill(s) across '+fmt(record.matchesSampled)+' saved match(es)':
  '• **'+title+':** no confirmed kill events saved';
}
async function rivals(db,body){
 const name=gamertag(body);
 const days=Number(opt(body,'days',0));
 if(!PERIODS.has(days))return 'Choose 7, 30, 180 days or all saved fights.';
 const response=await publicRivalTrends(db,{name,days});
 const failed=status(response,'rivalries');
 if(failed)return failed;
 const r=response.body;
 const leaders=r.killLeaders||{};
 const heading='⚔️ **Recorded Kill Rivalries: '+playerName(r.player)+'**\n'+
  (days?'Last '+days+' days':'All saved analysis dates')+' · '+
  fmt(r.matchesAnalysed)+' of '+fmt(r.matchesScanned)+' saved combat reports\n';
 const highlights=[
  rivalHighlight('You killed most',leaders.mostKilled,'kills'),
  rivalHighlight('Killed you most',leaders.mostKilledBy,'deaths')
 ].join('\n');
 const top=(r.rivals||[]).filter(x=>numeric(x.kills)>0||numeric(x.deaths)>0)
  .slice(0,5).map((x,i)=>
   (i+1)+'. '+playerName(x.name)+' · '+fmt(x.kills)+
   ' you killed / '+fmt(x.deaths)+' killed you').join('\n');
 return bounded(heading+highlights+'\n'+
  (top?'**Top recorded encounters**\n'+top+'\n':'')+
  '_Only verified direct-kill events from previously analysed matches. Visible opponent names are not verified cross-match account identities; missing fights are unknown._\n'+
  'Full opponent timelines: '+MATCHES+' (choose this player, then Kill rivalries).');
}
async function clanMatches(db,body){
 const days=Number(opt(body,'days',30));
 if(!CLAN_PERIODS.has(days))return 'Choose 7, 30 or 180 days.';
 const response=await publicClanMatchBoard(db,days);
 const failed=status(response,'clan matches');
 if(failed)return failed;
 const report=response.body;
 const players=new Map();
 for(const row of report.rows||[]){
  const key=row.platform+':'+row.name.toLowerCase();
  if(!players.has(key))players.set(key,{name:row.name,platform:row.platform,
    games:0,wins:0,known:0,kills:0,killsObserved:0});
  const p=players.get(key);
  p.games+=row.games;p.wins+=row.wins;p.known+=row.placed;
  p.kills+=row.kills;p.killsObserved+=row.killsObserved;
 }
 const leaders=[...players.values()].sort((a,b)=>b.games-a.games||
  b.kills-a.kills||a.name.localeCompare(b.name)).slice(0,5)
  .map((p,i)=>(i+1)+'. '+playerName(p.name)+' ('+
    (p.platform==='xbox'?'Xbox':'PS')+') · '+
    fmt(p.games)+' game(s) · '+(p.known?fmt(p.wins):'—')+
    ' wins · '+(p.killsObserved?fmt(p.kills):'—')+' kills')
  .join('\n');
 return bounded('📊 **Verified Clan Match History · '+days+' days**\n'+
  '**'+fmt(report.distinctMatches)+'** distinct archived matches · **'+
  fmt(report.playerMatchObservations)+'** player-match observations\n'+
  '**'+fmt(report.observedPlayers)+' / '+fmt(report.clanPlayers)+
  '** verified clan players have archived observations\n'+
  '**Most observed games by player**\n'+
  (leaders||'No eligible saved clan games in this period.')+'\n'+
  '_One squad game may count for several clan players; these are observed archive records, not lifetime totals._\n'+
  'Full map, mode and player comparisons: '+MATCHES);
}
function intel(db,body){
 const section=String(opt(body,'section','scout'));
 if(!FIELDS.has(section))return 'Choose a valid intelligence section.';
 const entries={
  form:{title:'Recent Form',url:MATCHES,tip:'Select a player and open Recent Form. Or use /form gamertag for a Discord summary.'},
  rivals:{title:'Kill Rivalries',url:MATCHES,tip:'Select a player and open Kill Rivalries. Or use /rivals gamertag.'},
  clan:{title:'Clan Match Intelligence',url:MATCHES,tip:'See daily activity, match leaderboards and comparisons. Or use /clanmatches.'},
  scout:{title:'Opponent Scouting',url:MATCHES,tip:'Select a saved player, then open Opponent Scouting to examine verified lobby observations and source games.'},
  stats:{title:'Complete Player Stats',url:SITE+'#full-stats',tip:'Browse the entire official saved stats field library and player detail views.'},
  weapons:{title:'Weapon Mastery',url:SITE+'#weapons',tip:'Compare verified weapon mastery by player and source.'},
  awards:{title:'Clan Awards',url:SITE+'#awards',tip:'Open real archived match records, awards and source coverage.'},
  health:{title:'Data Health',url:SITE+'#health',tip:'Check collection freshness and saved data coverage.'}
 };
 const x=entries[section];
 return '🔎 **'+x.title+'**\n'+x.tip+'\n'+x.url+
  '\n_Web dashboard is better suited to full tables and drilldowns; this command uses no PUBG API calls._';
}
module.exports={form,rivals,clanMatches,intel,metricLine,rivalHighlight,SITE,MATCHES};
