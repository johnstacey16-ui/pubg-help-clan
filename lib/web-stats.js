'use strict';
const MODES = Object.freeze(['solo','duo','squad','solo-fpp','duo-fpp','squad-fpp']);
const asNumber = n => Number.isFinite(Number(n)) ? Math.max(0, Number(n)) : 0;
const asText = s => String(s ?? '').slice(0,100);
const whitelistStats = s => {
  const o = {};
  const fields = [
    'assists','boosts','dBNOs','dailyKills','damageDealt','days','dailyWins',
    'headshotKills','heals','kills','longestKill','longestTimeSurvived',
    'losses','maxKillStreaks','mostSurvivalTime','revives','rideDistance',
    'roadKills','roundMostKills','roundsPlayed','suicides','swimDistance',
    'teamKills','timeSurvived','top10s','vehicleDestroys','walkDistance',
    'weaponsAcquired','weeklyKills','weeklyWins','wins'
  ];
  for(const f of fields) {
    const value=s?.[f];
    if((typeof value==='number'||(typeof value==='string'&&value.trim()!=='')) &&
       Number.isFinite(Number(value)) && Number(value)>=0 && Number(value)<=1e12)
      o[f]=Number(value);
  }
  return o;
};

const ADVANCED_FIELDS = Object.freeze({
  damage:'damageDealt',headshots:'headshotKills',assists:'assists',
  knocks:'dBNOs',revives:'revives',top10:'top10s',
  heals:'heals',boosts:'boosts',longestKill:'longestKill',
  walkDistance:'walkDistance',rideDistance:'rideDistance',
  timeSurvived:'timeSurvived'
});
function summarizeAdvanced(modes) {
  const rows=Object.values(modes || {});
  const summary={};
  for(const [name,src] of Object.entries(ADVANCED_FIELDS)){
    const values=rows.filter(row=>row[src]!==undefined && row[src]!==null)
      .map(row=>asNumber(row[src]));
    summary[name]=!values.length?null:
      name==='longestKill'?Math.max(...values):
      values.reduce((sum,n)=>sum+n,0);
  }
  return summary;
}
function shapeWebStats({ roster = [], players = [], details = [] }) {
  // Resolve each official roster assignment before aggregating. A gamertag is
  // not an account ID: Xbox and PSN may have different saved accounts with
  // the same visible name. Unqualified collisions remain ambiguous.
  const membership=(Array.isArray(roster)?roster:[])
    .filter(row=>row?.is_clan_member===true);
  const eligible=(Array.isArray(players)?players:[])
    .filter(p=>['xbox','psn'].includes(p?.platform));
  const assigned=new Set();
  const resolvedRoster=membership.map(row=>{
    const name=asText(row.gamertag).toLowerCase();
    const candidates=eligible.filter(p=>asText(p.gamertag).toLowerCase()===name &&
      (!['xbox','psn'].includes(row.platform)||p.platform===row.platform) &&
      (!row.pubg_account_id||p.pubg_account_id===row.pubg_account_id));
    const eligibleNameCount=eligible.filter(p=>asText(p.gamertag).toLowerCase()===name).length;
    const collision=eligibleNameCount>1&&!['xbox','psn'].includes(row.platform)&&
      !row.pubg_account_id;
    const player=row.status==='matched'&&!collision&&candidates.length===1&&!assigned.has(candidates[0].id)
      ?candidates[0]:null;
    if(player)assigned.add(player.id);
    return {row,player,status:collision&&row.status==='matched'?'ambiguous':row.status};
  });
  const raw=resolvedRoster.map(entry=>entry.player).filter(Boolean);
  const detailsById = new Map(details.map(d=>[d.player_id,d.game_mode_stats||{}]));
  const verified = raw.map(p => {
    const modes = {};
    const source = detailsById.get(p.id)||{};
    for(const m of MODES) if(source[m]) modes[m]=whitelistStats(source[m]);
    const games=asNumber(p.matches_played),kills=asNumber(p.total_kills),wins=asNumber(p.total_wins);
    return {
      name:asText(p.gamertag),platform:p.platform,
      kills,wins,matches:games,
      kd:games?Number((kills/games).toFixed(3)):null,
      winRate:games?Number((wins/games*100).toFixed(2)):null,
      updatedAt:p.last_checked || null,modes,
      advanced:summarizeAdvanced(modes)
    };
  }).sort((a,b)=>b.kills-a.kills||a.name.localeCompare(b.name));
  const rosterList = resolvedRoster.map(({row,player,status})=>({
    name:asText(row.gamertag),status:asText(status),
    platform:player?.platform || (['xbox','psn'].includes(row.platform)?row.platform:null),
    verified:Boolean(player)
  })).sort((a,b)=>a.name.localeCompare(b.name));
  const totals = verified.reduce((t,p)=>{
    t.kills+=p.kills;t.wins+=p.wins;t.matches+=p.matches;return t;
  },{kills:0,wins:0,matches:0});
  const byMode = Object.fromEntries(MODES.map(mode=>[mode,{matches:0,kills:0,wins:0,damage:0,assists:0,headshots:0,knocks:0,revives:0,top10:0}]));
  for(const p of verified) for(const mode of MODES){
    const s=p.modes[mode]||{},a=byMode[mode];
    a.matches+=s.roundsPlayed||0;a.kills+=s.kills||0;a.wins+=s.wins||0;
    a.damage+=s.damageDealt||0;a.assists+=s.assists||0;
    a.headshots+=s.headshotKills||0;a.knocks+=s.dBNOs||0;
    a.revives+=s.revives||0;a.top10+=s.top10s||0;
  }
  const states = {matched:0,pending:0,not_found:0,ambiguous:0,other:0};
  for(const r of rosterList){
    if(Object.hasOwn(states,r.status))states[r.status]++;
    else states.other++;
  }
  const lastSync = verified.map(x=>x.updatedAt).filter(Boolean).sort().at(-1)||null;
  return {
    schemaVersion:1,generatedAt:new Date().toISOString(),
    origin:'Supabase verified console statistics',
    roster:{total:rosterList.length,verified:verified.length,states,entries:rosterList},
    totals,platforms:{xbox:verified.filter(x=>x.platform==='xbox').length,
      psn:verified.filter(x=>x.platform==='psn').length},
    lastSync,modeOrder:MODES,modeTotals:byMode,players:verified
  };
}
module.exports = {MODES,shapeWebStats,whitelistStats,summarizeAdvanced};
