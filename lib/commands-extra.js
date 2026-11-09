'use strict';
const { player, modeRow, opt, fmt, label } = require('./commands-core');
const { playerEndpoint, currentSeason, matchEndpoint } = require('./pubg-endpoints');
const {mapName}=require('../assets/pubg-dictionaries');

function parseMatch(payload, accountId) {
  const root = payload?.data || {};
  const attr = root.attributes || {};
  const included = payload?.included || [];
  const members = included.filter(p => p.type === 'participant');
  const participant = members.find(p => p.attributes?.stats?.playerId === accountId);
  const s = participant?.attributes?.stats || null;
  return {
    id: root.id, map: attr.mapName || 'Unknown', mode: attr.gameMode || 'Unknown',
    date: attr.createdAt, duration: Number(attr.duration) || 0, count: members.length,
    s, telemetry: included.some(p => p.type === 'asset' && p.attributes?.URL)
  };
}
function detailedMatch(m, gamertag, matchId) {
  const lines = [
    '🎮 **Match report: ' + label(gamertag) + '**',
    'Map: **' + mapName(m.map) + '** · Mode: **' + m.mode + '**',
    'Date: ' + (m.date || 'Unknown') +
      ' · Duration: ' + (m.duration ? Math.round(m.duration/60)+' min' : 'N/A'),
    'Participants recorded: ' + m.count
  ];
  if (m.s) {
    const s = m.s;
    lines.push(
      '**Placement: #'+(s.winPlace||'?')+'**',
      'Kills '+fmt(s.kills)+' · Damage '+fmt(s.damageDealt)+
        ' · Assists '+fmt(s.assists),
      'Headshot kills '+fmt(s.headshotKills)+
        ' · Knockdowns '+fmt(s.DBNOs)+' · Revives '+fmt(s.revives),
      'Longest kill '+fmt(s.longestKill)+'m · Walked '+fmt(s.walkDistance)+
        'm · Driven '+fmt(s.rideDistance)+'m',
      'Heals '+fmt(s.heals)+' · Boosts '+fmt(s.boosts)
    );
  } else lines.push('Player is not recorded among this match’s participants.');
  lines.push('Telemetry: '+(m.telemetry?'available from PUBG':'not available'));
  lines.push('Match ID: '+matchId);
  return lines.join('\n').slice(0,1850);
}
async function recent(db, body) {
  const name = String(opt(body,'gamertag')).trim();
  const requested = Math.min(5,Math.max(1,Number(opt(body,'count',3))||3));
  const resolved = await player(db,name);
  if (resolved.message) return resolved.message;
  const response = await playerEndpoint(db,resolved.player,'',15*60);
  if (!response.data) return '⏳ Recent match list unavailable ('+response.state+').';
  const ids=(response.data.data?.relationships?.matches?.data||[])
    .map(m=>m.id).filter(Boolean).slice(0,requested);
  if (!ids.length) return '🎮 No recent public matches available for '+
    label(resolved.player.gamertag)+'. PUBG only retains them for about 14 days.';
  const matches=await Promise.all(ids.map(id=>matchEndpoint(db,id)));
  const lines=matches.map((item,i)=>{
    if (!item.data) return '• Match '+ids[i]+': '+item.state;
    const m=parseMatch(item.data,resolved.player.pubg_account_id);
    return '• #'+(m.s?.winPlace||'?')+' '+mapName(m.map)+' · '+m.mode+
      ' · '+(m.s?fmt(m.s.kills)+' kills · '+fmt(m.s.damageDealt)+' damage':
        'player data not found')+
      '\n  Match ID: '+ids[i];
  });
  return ('🗺️ **Recent matches: '+label(resolved.player.gamertag)+'**\n'+
    lines.join('\n')+'\nUse /match with a match ID for detailed results.'+
    '\n_Recent public matches only (PUBG retention ~14 days)._').slice(0,1850);
}
async function match(db, body) {
  const name=String(opt(body,'gamertag')).trim();
  const id=String(opt(body,'matchid')).trim();
  const resolved=await player(db,name);
  if (resolved.message) return resolved.message;
  const match=await matchEndpoint(db,id);
  if (!match.data) return 'This match is unavailable ('+match.state+
    '). PUBG does not retain older matches indefinitely.';
  return detailedMatch(parseMatch(match.data,resolved.player.pubg_account_id),
    resolved.player.gamertag,id);
}
function weaponRows(response) {
  const attributes=response?.data?.attributes||{};
  const all=attributes.weaponSummaries||attributes.weaponMastery||{};
  return Object.entries(all).filter(([,obj])=>obj&&typeof obj==='object')
    .map(([name,obj])=>{
      // Live console mastery records use LevelCurrent and capitalised stats
      // keys, while older cached/test records may use lower-case legacy keys.
      const official=obj.OfficialStatsTotal||obj.stats?.OfficialStatsTotal||
        obj.stats?.officialStatsTotal;
      const s=official||obj.StatsTotal||{};
      return {
        weapon:name.replace(/^Item_Weapon_/,'').replace(/_C$/,'').replace(/_/g,' '),
        level:obj.LevelCurrent??obj.weaponLevel??obj.level??null,
        kills:s.Kills??s.kills??obj.kills??null,
        official:Boolean(official)
      };
    }).sort((a,b)=>Number(b.kills||0)-Number(a.kills||0)||
      Number(b.level||0)-Number(a.level||0)).slice(0,10);
}
async function mastery(db,body) {
  const name=String(opt(body,'gamertag')).trim();
  const type=String(opt(body,'type','weapon'));
  if (!['weapon','survival'].includes(type)) return 'Choose weapon or survival mastery.';
  const resolved=await player(db,name);
  if (resolved.message) return resolved.message;
  const result=await playerEndpoint(db,resolved.player,type+'_mastery',3*3600);
  if (!result.data) return 'Mastery stats unavailable ('+result.state+
    '); this endpoint might not be supported for the account.';
  const attr=result.data.data?.attributes||{};
  if (type==='weapon') {
    const items=weaponRows(result.data);
    return ('🔫 **Weapon mastery: '+label(resolved.player.gamertag)+'**\n'+
      (items.length?items.map((w,i)=>(i+1)+'. **'+w.weapon+'**'+
        (w.level!==null?' · Level '+w.level:'')+
        (w.kills!==null?' · '+fmt(w.kills)+(w.official?' official':'')+' kills':'')).join('\n'):
        'PUBG returned a mastery record but no recognised weapon breakdown.')+
      '\n_Source: '+result.state+' PUBG mastery data_').slice(0,1850);
  }
  const masteryObj=attr.survivalMastery||attr;
  const fields=Object.entries(masteryObj).filter(([key,v])=>
    /level|xp|tier|progress/i.test(key)&&['string','number'].includes(typeof v))
    .slice(0,12).map(([key,v])=>key+': '+v);
  return ('🏅 **Survival mastery: '+label(resolved.player.gamertag)+'**\n'+
    (fields.join('\n')||'PUBG returned mastery data without a recognised level summary.')+
    '\n_Source: '+result.state+' PUBG mastery data_').slice(0,1850);
}
async function season(db,body,ranked=false) {
  const name=String(opt(body,'gamertag')).trim();
  const resolved=await player(db,name);
  if (resolved.message) return resolved.message;
  const current=await currentSeason(db,resolved.player.platform);
  if (!current.seasonId) return 'Current season unavailable ('+current.state+').';
  const data=await playerEndpoint(db,resolved.player,
    'seasons/'+encodeURIComponent(current.seasonId)+(ranked?'/ranked':''),
    2*3600);
  if (!data.data) return (ranked?'Ranked':'Season')+
    ' statistics unavailable ('+data.state+').';
  const attr=data.data.data?.attributes||{};
  const modes=ranked?attr.rankedGameModeStats:attr.gameModeStats;
  if (!modes||typeof modes!=='object') return 'No recognised '+(ranked?'ranked':'season')+
    ' game-mode statistics returned by PUBG.';
  const lines=Object.entries(modes).filter(([,s])=>s&&Number(s.roundsPlayed)>0)
    .slice(0,6).map(([mode,s])=>{
      if (!ranked) return modeRow(mode,s);
      const tier=s.currentTier?.tier||s.currentTier?.name||'Unranked';
      const sub=s.currentTier?.subTier||'';
      return '**'+mode.toUpperCase()+'** — '+tier+' '+sub+
        ' · RP '+fmt(s.currentRankPoint)+' · '+fmt(s.roundsPlayed)+
        ' matches · '+fmt(s.kills)+' kills · '+fmt(s.wins)+' wins';
    });
  return ('🏆 **'+(ranked?'Ranked':'Current season')+': '+
    label(resolved.player.gamertag)+'**\nSeason: '+current.seasonId+'\n'+
    (lines.join('\n\n')||'No recorded games for this season.')+
    '\n_Source: '+data.state+' PUBG API data_').slice(0,1850);
}
module.exports = { recent,match,mastery,season,parseMatch,detailedMatch,weaponRows };
