'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  escapeLike, safeDiscord, exactPlayer, lifetimeSummary, topPlayedModes, gameModeStats
} = require('../lib/pubg-utils');

test('literal SQL name lookup escapes underscores, percent and backslashes', () => {
  assert.equal(escapeLike('Mralex_00'), 'Mralex\\_00');
  assert.equal(escapeLike('a%b'), 'a\\%b');
  assert.equal(escapeLike('a\\b'), 'a\\\\b');
});
test('Discord names are escaped, not altered as PUBG account identities', () => {
  assert.equal(safeDiscord('Gunny87*'), 'Gunny87\\*');
  assert.equal(safeDiscord('Babaroga-*-'), 'Babaroga-\\*-');
  assert.equal(safeDiscord('SASHA_Get2012'), 'SASHA\\_Get2012');
  assert.equal(safeDiscord('@everyone'), '@\u200beveryone');
  assert.equal(safeDiscord('<@123456789012345678>'), '\\<@\u200b123456789012345678\\>');
});
test('case insensitive exact player matching ignores other returned names', () => {
  const items = [{ id: 'x', attributes: { name: 'Example_1' } }, { id: 'y', attributes: { name: 'Other' } }];
  assert.equal(exactPlayer(items, 'example_1').id, 'x');
  assert.equal(exactPlayer(items, 'example_2'), undefined);
});
test('aggregates lifetime stats without doubling mode totals', () => {
  const payload = { data: { attributes: { gameModeStats: {
    solo: { roundsPlayed: 3, kills: 8, wins: 1 },
    'squad-fpp': { roundsPlayed: 10, kills: 20, wins: 2 },
    squad: { roundsPlayed: 2, kills: 4, wins: 0 }
  } } } };
  assert.deepEqual(lifetimeSummary(payload), { rounds: 15, kills: 32, wins: 3 });
  assert.deepEqual(topPlayedModes(gameModeStats(payload), 1), [
    { mode: 'squad-fpp', rounds: 10, kills: 20, wins: 2 }
  ]);
});
test('missing lifetime payload is an error, not a fabricated zero-stat account', () => {
  assert.throws(() => lifetimeSummary({ data: [] }), /unavailable/);
});
