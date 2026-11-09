'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { canManage,renderDashboard,REFRESH_BUTTON,SECTIONS,dailyUpdate } = require('../lib/channel-dashboard');
const { commands } = require('../lib/command-definitions');

function fixture() {
  const p={id:1,gamertag:'Official_One',platform:'xbox',
    total_kills:200,total_wins:12,matches_played:100,last_checked:'2026-11-03T12:00:00Z'};
  return {
    clan:[{gamertag:'Official_One',is_clan_member:true,status:'matched'},
      {gamertag:'PendingTwo',is_clan_member:true,status:'pending'}],
    tracked:1,verified:[p],
    states:{pending:1,matched:1,ambiguous:0,not_found:0,error:0,identified:0},
    totals:{kills:200,wins:12,matches:100},
    breakdown:{
      solo:{rounds:10,kills:15,wins:1},
      duo:{rounds:30,kills:70,wins:3},
      squad:{rounds:60,kills:115,wins:8},
      'solo-fpp':{rounds:0,kills:0,wins:0},
      'duo-fpp':{rounds:0,kills:0,wins:0},
      'squad-fpp':{rounds:0,kills:0,wins:0}
    },
    records:[],lastChecked:Date.parse(p.last_checked)
  };
}
test('dashboard setup requires channel-management privileges', () => {
  assert.equal(canManage({member:{permissions:'0'}}),false);
  assert.equal(canManage({member:{permissions:'16'}}),true);
  assert.equal(canManage({member:{permissions:'8'}}),true);
  assert.equal(canManage({member:{permissions:'1024'}}),false);
});
test('dashboard renders eight reusable Supabase-powered cards with refresh button', () => {
  const rendered=renderDashboard(fixture());
  assert.deepEqual(Object.keys(rendered),SECTIONS);
  for(const card of Object.values(rendered)) {
    assert.equal(card.flags,32768);
    assert.equal(card.content,null);
    assert.deepEqual(card.embeds,[]);
    assert.equal(card.components[0].type,17);
    assert.equal(card.components[0].components[0].type,10);
    assert.equal(card.components[1].components[0].custom_id,REFRESH_BUTTON);
    assert.equal(card.components[1].components[0].style,1);
    assert.equal(card.components[1].components[1].style,5);
    assert.equal(card.components[1].components[1].url,'https://pubg-help-clan.vercel.app/dashboard/');
    assert.equal(card.components[1].components[2].style,5);
    assert.equal(card.components[1].components[2].url,'https://pubg-help-clan.vercel.app/dashboard/#matches');
    assert.deepEqual(card.allowed_mentions,{parse:[]});
  }
  const content = name => rendered[name].components[0].components.map(x=>x.content||'').join('\n');
  assert.match(content('overview'),/200/);
  assert.match(content('leaderboard'),/Official\\_One/);
  assert.match(content('roster'),/1/);
  assert.match(content('players1'),/Official\\_One/);
  assert.match(content('players1'),/PendingTwo/);
  assert.match(content('players1'),/200 kills/);
});
test('dashboard command uses restricted slash-command subcommands', () => {
  const command=commands.find(c=>c.name==='dashboard');
  assert.equal(command.default_member_permissions,'16');
  assert.deepEqual(command.options.map(x=>x.name),['setup','refresh','status']);
  assert.equal(command.options.every(x=>x.type===1),true);
});

test('single /setup command is administrator-scoped and keeps existing dashboard commands', () => {
  const setup=commands.find(c=>c.name==='setup');
  assert.ok(setup);
  assert.equal(setup.type,1);
  assert.equal(setup.default_member_permissions,'16');
  assert.equal(commands.filter(c=>c.name==='setup').length,1);
  assert.ok(commands.find(c=>c.name==='dashboard'));
});
test('daily scheduled refresh does not post until a channel has been configured', async () => {
  let requests=0;
  const db={
    from(table) {
      assert.equal(table,'discord_dashboard_channels');
      requests++;
      return {
        select() { return this; },
        eq() { return this; },
        async maybeSingle() { return { data:null,error:null }; }
      };
    }
  };
  const r=await dailyUpdate(db);
  assert.deepEqual(r,{status:'not_configured'});
  assert.equal(requests,1);
});
