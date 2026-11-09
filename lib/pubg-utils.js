'use strict';

const MODES = Object.freeze(['solo', 'duo', 'squad', 'solo-fpp', 'duo-fpp', 'squad-fpp']);

function escapeLike(value) {
  // PostgREST uses PostgreSQL ILIKE, where % and _ have special meaning.
  return String(value).replace(/[\\%_]/g, ch => '\\' + ch);
}
function safeDiscord(value) {
  // Neutralise all Discord mentions, even within untrusted saved player names.
  // This is output escaping only: the actual PUBG account name is unchanged.
  return String(value).replace(/@/g, '@\u200b')
    .replace(/[\\*_`~|><]/g, ch => '\\' + ch).slice(0, 120);
}
function exactPlayer(list, gamertag) {
  return (list || []).find(item =>
    item?.attributes?.name?.toLowerCase() === String(gamertag).toLowerCase());
}
function gameModeStats(payload) {
  const modes = payload?.data?.attributes?.gameModeStats;
  if (!modes || typeof modes !== 'object' || Array.isArray(modes))
    throw new Error('PUBG lifetime statistics unavailable');
  return modes;
}
function lifetimeSummary(payload) {
  const stats = gameModeStats(payload);
  return MODES.reduce((totals, mode) => {
    const item = stats[mode] || {};
    totals.kills += Number(item.kills) || 0;
    totals.wins += Number(item.wins) || 0;
    totals.rounds += Number(item.roundsPlayed) || 0;
    return totals;
  }, { kills: 0, wins: 0, rounds: 0 });
}
function topPlayedModes(stats, maximum = 3) {
  return Object.entries(stats || {})
    .filter(([mode, data]) => MODES.includes(mode) && data && Number(data.roundsPlayed) > 0)
    .sort((a, b) => Number(b[1].roundsPlayed) - Number(a[1].roundsPlayed))
    .slice(0, maximum)
    .map(([mode, data]) => ({
      mode, rounds: Number(data.roundsPlayed) || 0,
      kills: Number(data.kills) || 0, wins: Number(data.wins) || 0
    }));
}
module.exports = { MODES, escapeLike, safeDiscord, exactPlayer, gameModeStats, lifetimeSummary, topPlayedModes };
