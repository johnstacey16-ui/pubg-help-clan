'use strict';
const { safeDiscord } = require('./pubg-utils');
const { getStats } = require('./live-stats');

const MODES = ['solo', 'duo', 'squad', 'solo-fpp', 'duo-fpp', 'squad-fpp'];
const fmt = v => (Number(v) || 0).toLocaleString('en-GB');
const opt = (body, key, fallback = '') => body.data?.options?.find(o => o.name === key)?.value ?? fallback;
const label = name => safeDiscord(name);
const round = n => Number(n) || 0;
function statusText(r, name) {
  if (r.state === 'queued') return '⏳ ' + label(name) + ' is queued for PUBG API capacity.';
  if (r.state === 'not_found') return '🔎 No exact Xbox or PlayStation match for ' + label(name) + '.';
  if (r.state === 'ambiguous') return '🎮 ' + label(name) + ' exists on Xbox and PlayStation; select a console.';
  if (r.state === 'invalid') return 'Enter a valid PUBG gamertag.';
  return '⚠️ ' + (r.message || 'Stats unavailable right now.');
}
async function player(db, name) {
  const r = await getStats(db, name);
  return r.state === 'player' ? { player: r.player, modes: r.modes, source: r.source }
    : { message: statusText(r, name) };
}
function modeRow(mode, s, detailed = false) {
  const played = round(s.roundsPlayed);
  const info = [
    '**' + mode.toUpperCase() + '** — ' + fmt(played) + ' played',
    'Kills ' + fmt(s.kills) + ' · Wins ' + fmt(s.wins) +
      ' · Kills/game ' + (played ? (round(s.kills) / played).toFixed(2) : 'N/A')
  ];
  if (detailed) {
    const fields = [
      ['top10s','Top 10'],['assists','Assists'],['headshotKills','Headshots'],
      ['damageDealt','Damage'],['revives','Revives'],['dBNOs','Knockdowns'],
      ['longestKill','Longest kill (m)'],['walkDistance','Walked (m)'],
      ['rideDistance','Driven (m)'],['timeSurvived','Survived (sec)']
    ].filter(([key]) => Number.isFinite(Number(s[key]))).map(([key, title]) =>
      title + ' ' + fmt(s[key]));
    for (let i = 0; i < fields.length; i += 3) info.push(fields.slice(i,i+3).join(' · '));
  }
  return info.join('\n');
}
async function modes(db, body) {
  const name = String(opt(body,'gamertag')).trim();
  const choice = String(opt(body,'mode','all'));
  if (!['all',...MODES].includes(choice)) return 'Invalid game mode.';
  const r = await player(db,name);
  if (r.message) return r.message;
  const rows = (choice === 'all' ? MODES : [choice]).filter(mode =>
    Number(r.modes?.[mode]?.roundsPlayed)>0)
    .map(mode => modeRow(mode,r.modes[mode],choice !== 'all'));
  return ('🎮 **Game modes: ' + label(r.player.gamertag) + '**\n' +
    (rows.join('\n\n') || 'No recorded matches for this mode.') +
    '\n_Source: ' + (r.source === 'live' ? 'new PUBG lookup' : 'saved PUBG stats') + '_').slice(0,1900);
}
async function compare(db, body) {
  const aName = String(opt(body,'player1')).trim(), bName = String(opt(body,'player2')).trim();
  if (!aName || !bName || aName.toLowerCase() === bName.toLowerCase())
    return 'Choose two different PUBG gamertags.';
  const a = await player(db,aName);
  const b = await player(db,bName);
  if (a.message || b.message) return [a.message,b.message].filter(Boolean).join('\n');
  const p=a.player, q=b.player;
  const x=round(p.matches_played), y=round(q.matches_played);
  const rows=[
    ['Kills',fmt(p.total_kills),fmt(q.total_kills)],
    ['Wins',fmt(p.total_wins),fmt(q.total_wins)],
    ['Player matches',fmt(x),fmt(y)],
    ['Kills/match',x?(round(p.total_kills)/x).toFixed(2):'N/A',
      y?(round(q.total_kills)/y).toFixed(2):'N/A'],
    ['Win rate',x?(100*round(p.total_wins)/x).toFixed(1)+'%':'N/A',
      y?(100*round(q.total_wins)/y).toFixed(1)+'%':'N/A']
  ];
  return '⚔️ **Player comparison**\n**' + label(p.gamertag) + '** (' + p.platform +
    ') vs **' + label(q.gamertag) + '** (' + q.platform + ')\n' +
    rows.map(r => '**' + r[0] + '**: ' + r[1] + ' vs ' + r[2]).join('\n') +
    '\n_Based on actual saved PUBG lifetime stats._';
}
async function roster(db, body) {
  const page = Math.min(10,Math.max(1,Math.trunc(Number(opt(body,'page',1))||1)));
  const start=(page-1)*15;
  const [rows,total]=await Promise.all([
    db.from('player_import_queue').select('gamertag,status,platform,pubg_account_id')
      .eq('is_clan_member',true).order('id').range(start,start+14),
    db.from('player_import_queue').select('id',{count:'exact',head:true})
      .eq('is_clan_member',true)
  ]);
  if (rows.error) throw rows.error;
  if (total.error) throw total.error;
  const mark=x=>x.status==='matched'?'✅':
    x.status==='ambiguous'?'🎮':x.status==='not_found'?'❓':
      x.pubg_account_id?'⏳':'⌛';
  const lines=(rows.data||[]).map((x,i)=>
    (start+i+1)+'. '+mark(x)+' **'+label(x.gamertag)+'**'+
    (x.platform?' ('+(x.platform==='xbox'?'Xbox':'PS')+')':''));
  return ('👥 **Official clan roster** — page '+page+'/'+
    Math.max(1,Math.ceil((total.count||0)/15))+'\n'+(lines.join('\n')||'No players on this page.')+
    '\n✅ saved · ⏳ identity found · ⌛ queued · 🎮 ambiguous · ❓ not found'
  ).slice(0,1900);
}
async function clan(db) {
  const list=await db.from('player_import_queue')
    .select('gamertag,status').eq('is_clan_member',true).limit(1000);
  if (list.error) throw list.error;
  const members=list.data||[];
  const names=members.filter(x=>x.status==='matched').map(x=>x.gamertag);
  const r=names.length?await db.from('players')
    .select('gamertag,total_kills,total_wins,matches_played')
    .in('gamertag',names):{data:[],error:null};
  if (r.error) throw r.error;
  const stats=r.data||[];
  const sums=stats.reduce((a,p)=>({
    kills:a.kills+round(p.total_kills),wins:a.wins+round(p.total_wins),
    games:a.games+round(p.matches_played)
  }),{kills:0,wins:0,games:0});
  return '🏰 **Official console clan overview**\nMembers: **'+members.length+
    '** · Verified: **'+stats.length+'** · Pending: '+
    members.filter(x=>x.status==='pending').length+
    ' · Ambiguous: '+members.filter(x=>x.status==='ambiguous').length+
    ' · Not found: '+members.filter(x=>x.status==='not_found').length+
    '\n**Combined verified lifetime totals:**\nKills '+fmt(sums.kills)+
    ' · Wins '+fmt(sums.wins)+' · Player matches '+fmt(sums.games)+
    '\n_These are summed player totals, so shared squad games can be counted more than once._';
}
function help() {
  return [
    '🎮 **PUBG Console Bot — Commands**',
    '/stats gamertag — Lifetime stats and Groq commentary',
    '/modes gamertag [mode] — Full Solo/Duo/Squad breakdown',
    '/compare player1 player2 — Compare two players',
    '/recent gamertag [count] — Recent PUBG match lookup (up to 5)',
    '/form gamertag — Compare saved last 10 vs previous 10 games',
    '/rivals gamertag [days] — Real direct-kill rivalries from saved combat',
    '/clanmatches [days] — Archived clan match results (7/30/180 days)',
    '/intel [section] — Website links for scouting, match analysis and more',
    '/match gamertag matchid — Detailed result for one match',
    '/squad gamertag matchid — Your squad members and results',
    '/teammates gamertag [count] — Recent recurring squadmates',
    '/mastery gamertag type — Weapon or survival mastery',
    '/season gamertag — Current season results',
    '/ranked gamertag — Current ranked tier and performance',
    '/setup — Admin: set this channel as the permanent clan dashboard',
    '/dashboard setup — Admin: create pinned dashboard cards in this channel',
    '/dashboard refresh — Admin: refresh saved channel dashboard stats',
    '/leaderboard — Official clan kills ranking with importer',
    '/roster [page] — Original clan roster and import progress',
    '/clan — Official clan summary',
    '/clanmanage add/remove/status/audit — Manage Server: edit official clan membership',
    '/help — This command guide',
    '',
    'Only Xbox and PlayStation. Tracked searches are saved but not automatically clan members.',
    'Historical form, rivalries and clan matches reuse saved Supabase data without calling PUBG.',
    'Live recent-match and other refresh commands still use the shared PUBG API budget.'
  ].join('\n');
}
module.exports = { modes,compare,roster,clan,help,player,modeRow,opt,fmt,label };
