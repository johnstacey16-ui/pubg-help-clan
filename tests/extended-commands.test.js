'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { commands } = require('../lib/command-definitions');
const core = require('../lib/commands-core');
const extra = require('../lib/commands-extra');
const { matchEndpoint } = require('../lib/pubg-endpoints');

test('all twenty-one Discord commands have unique names and valid required-option order', () => {
  assert.equal(commands.length, 21);
  assert.equal(new Set(commands.map(x => x.name)).size, commands.length);
  const names = new Set(commands.map(x => x.name));
  for (const name of ['stats','leaderboard','roster','clanmanage','help','clan',
    'compare','modes','recent','form','rivals','clanmatches','intel','match','squad','teammates','mastery','season','ranked','dashboard','setup'])
    assert.ok(names.has(name), 'Missing command ' + name);
  for (const cmd of commands) {
    assert.match(cmd.name, /^[a-z]{1,32}$/);
    assert.ok(cmd.description.length <= 100);
    let optionalSeen = false;
    for (const option of cmd.options || []) {
      if (cmd.name === 'dashboard' || cmd.name === 'clanmanage') {
        assert.equal(option.type, 1, 'Dashboard options must be subcommands');
        continue;
      }
      assert.ok(option.type === 3 || option.type === 4);
      if (!option.required) optionalSeen = true;
      if (option.required) assert.equal(optionalSeen, false,
        'Required parameter after optional for ' + cmd.name);
    }
  }
  assert.match(core.help(), /\/recent/);
  assert.match(core.help(), /\/mastery/);
  assert.match(core.help(), /\/form/);
  assert.match(core.help(), /\/rivals/);
  assert.match(core.help(), /\/clanmatches/);
  assert.match(core.help(), /\/intel/);
});
test('game-mode stat output includes only verified supplied statistics', () => {
  const row = core.modeRow('squad', {
    roundsPlayed: 10, kills: 50, wins: 3, damageDealt: 1300,
    headshotKills: 6
  }, true);
  assert.match(row, /50/);
  assert.match(row, /1300|1,300/);
  assert.match(row, /Headshots/);
  assert.match(row, /3/);
});
test('match parser finds player by PUBG account id rather than name alone', () => {
  const data = {
    data: { id: 'abc-match', attributes: {
      mapName: 'Baltic_Main', gameMode: 'squad', duration: 1800
    } },
    included: [
      { type: 'participant', attributes: { stats: {
        playerId: 'account.a', kills: 3, winPlace: 2
      } } },
      { type: 'participant', attributes: { stats: {
        playerId: 'account.b', kills: 10, winPlace: 1
      } } },
      { type: 'asset', attributes: { URL: 'https://telemetry-cdn.pubg.com/example.json' } }
    ]
  };
  const result = extra.parseMatch(data, 'account.b');
  assert.equal(result.s.kills, 10);
  assert.equal(result.count, 2);
  assert.equal(result.telemetry, true);
  assert.equal(extra.parseMatch(data, 'account.missing').s, null);
});
test('weapon mastery parser handles documented summary structures', () => {
  const data = { data: { attributes: { weaponSummaries: {
    Item_Weapon_M416_C: { weaponLevel: 50, stats: {
      OfficialStatsTotal: { kills: 200 }
    } },
    Item_Weapon_AK47_C: { weaponLevel: 24, stats: {
      OfficialStatsTotal: { kills: 90 }
    } }
  } } } };
  const weapons = extra.weaponRows(data);
  assert.equal(weapons[0].weapon, 'M416');
  assert.equal(weapons[0].kills, 200);
  assert.equal(weapons[1].level, 24);
});
test('only valid match IDs are requested', async () => {
  const db = { from() { throw Error('Invalid match ID must not access Supabase'); } };
  const result = await matchEndpoint(db, '../invalid');
  assert.equal(result.state, 'invalid');
});


test('weapon parser maps real PUBG LevelCurrent and capitalised OfficialStatsTotal fields',()=>{
  const data={data:{attributes:{weaponSummaries:{
    Item_Weapon_BerylM762_C:{LevelCurrent:35,TierCurrent:5,
      StatsTotal:{Kills:1520},OfficialStatsTotal:{Kills:1397,HeadShots:490}},
    Item_Weapon_M416_C:{LevelCurrent:12,StatsTotal:{Kills:55}}
  }}}};
  const result=extra.weaponRows(data);
  assert.equal(result[0].weapon,'BerylM762');
  assert.equal(result[0].level,35);
  assert.equal(result[0].kills,1397);
  assert.equal(result[0].official,true);
  assert.equal(result[1].kills,55);
  assert.equal(result[1].official,false);
});

test('discord detailed match reports translate official battleground IDs',()=>{
 const result=extra.detailedMatch({
  id:'synthetic',map:'Baltic_Main',mode:'squad',date:'2026-11-08T12:00:00Z',
  duration:1800,count:100,s:{winPlace:3,kills:4,damageDealt:450}
 },'Player One','id-test');
 assert.match(result,/Erangel/);
 assert.doesNotMatch(result,/Baltic_Main/);
});
