'use strict';
const { player, opt, label, fmt } = require('./commands-core');
const { playerEndpoint, matchEndpoint } = require('./pubg-endpoints');
const { mapName } = require('../assets/pubg-dictionaries');

function squadForMatch(payload, accountId) {
  const included = Array.isArray(payload?.included) ? payload.included : [];
  const participants = included.filter(x => x.type === 'participant');
  const target = participants.find(x => x.attributes?.stats?.playerId === accountId);
  if (!target) return { state: 'player_missing', members: [] };

  const roster = included.find(x => x.type === 'roster' &&
    Array.isArray(x.relationships?.participants?.data) &&
    x.relationships.participants.data.some(x => x.id === target.id));
  if (!roster) return { state: 'roster_missing', members: [] };
  const byId = new Map(participants.map(x => [x.id, x]));
  const members = roster.relationships.participants.data
    .map(ref => byId.get(ref.id)).filter(Boolean).map(p => {
      const stats = p.attributes?.stats || {};
      return {
        accountId: stats.playerId || null,
        name: typeof stats.name === 'string' ? stats.name : 'Unknown',
        kills: Number(stats.kills) || 0,
        damage: Number(stats.damageDealt) || 0,
        assists: Number(stats.assists) || 0,
        knocks: Number(stats.DBNOs) || 0,
        placement: stats.winPlace || null,
        isSelf: p.id === target.id
      };
    });
  return {
    state: members.length ? 'ok' : 'roster_missing',
    members,
    placement: target.attributes?.stats?.winPlace ?? null,
    matchId: payload?.data?.id ?? null,
    map: payload?.data?.attributes?.mapName ?? null,
    mode: payload?.data?.attributes?.gameMode ?? null
  };
}
function squadLines(group, max = 10) {
  if (group.state !== 'ok') return 'PUBG did not return a usable squad roster for this player in this match.';
  return group.members.slice(0, max).map(m =>
    (m.isSelf ? '⭐ ' : '• ') + '**' + label(m.name) + '** — ' +
    fmt(m.kills) + ' kills · ' + fmt(m.damage) + ' damage · ' +
    fmt(m.assists) + ' assists · ' + fmt(m.knocks) + ' knocks'
  ).join('\n');
}
async function squad(db, body) {
  const name = String(opt(body, 'gamertag')).trim();
  const matchId = String(opt(body, 'matchid')).trim();
  const r = await player(db, name);
  if (r.message) return r.message;
  const m = await matchEndpoint(db, matchId);
  if (!m.data) return 'Match unavailable (' + m.state + '). PUBG normally retains match records for 14 days.';
  const team = squadForMatch(m.data, r.player.pubg_account_id);
  if (team.state === 'player_missing')
    return 'This PUBG player was not found among that match’s participants. Check the match ID.';
  return ('👥 **Squad analysis: ' + label(r.player.gamertag) + '**\n' +
    'Map: ' + mapName(team.map || 'Unknown') + ' · Mode: ' + (team.mode || 'Unknown') +
    ' · Placement: ' + (team.placement ? '#' + team.placement : 'N/A') + '\n' +
    squadLines(team) + '\nMatch ID: ' + matchId
  ).slice(0, 1900);
}
function aggregateTeammates(groups, accountId) {
  const map = new Map();
  for (const group of groups) {
    if (group?.state !== 'ok') continue;
    const seen = new Set();
    for (const member of group.members) {
      if (member.isSelf || member.accountId === accountId || !member.accountId ||
          seen.has(member.accountId)) continue;
      seen.add(member.accountId);
      const row = map.get(member.accountId) || {
        name: member.name, matches: 0, kills: 0, assists: 0, damage: 0
      };
      row.matches++;
      row.kills += member.kills;
      row.assists += member.assists;
      row.damage += member.damage;
      map.set(member.accountId, row);
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    b.matches - a.matches || b.kills - a.kills || a.name.localeCompare(b.name));
}
async function teammates(db, body) {
  const name = String(opt(body, 'gamertag')).trim();
  const count = Math.min(5, Math.max(1, Math.trunc(Number(opt(body, 'count', 5)) || 5)));
  const r = await player(db, name);
  if (r.message) return r.message;
  const recent = await playerEndpoint(db, r.player, '', 15 * 60);
  if (!recent.data) return 'Recent match index unavailable (' + recent.state + ').';
  const ids = (recent.data.data?.relationships?.matches?.data || [])
    .map(item => item.id).filter(Boolean).slice(0, count);
  if (!ids.length) return 'No recent PUBG matches found for ' + label(r.player.gamertag) + '.';

  const responses = await Promise.all(ids.map(id => matchEndpoint(db, id)));
  const groups = responses.filter(m => m.data).map(m =>
    squadForMatch(m.data, r.player.pubg_account_id));
  const completed = groups.filter(g => g.state === 'ok').length;
  const rows = aggregateTeammates(groups, r.player.pubg_account_id).slice(0, 10);
  return ('🤝 **Recent teammates: ' + label(r.player.gamertag) + '**\n' +
    'Team rosters analysed: ' + completed + ' / ' + ids.length + ' recent matches\n' +
    (rows.length ? rows.map((p, i) => (i + 1) + '. **' + label(p.name) +
      '** — together ' + p.matches + ' match(es), ' + fmt(p.kills) + ' kills, ' +
      fmt(p.damage) + ' damage').join('\n') :
      'No teammates found in the available roster records (solo matches may not have teammates).') +
    '\n_Only recent PUBG match rosters are used; not a lifetime teammate ranking._'
  ).slice(0, 1900);
}
module.exports = { squadForMatch, squadLines, aggregateTeammates, squad, teammates };
