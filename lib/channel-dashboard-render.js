'use strict';
// Pure Discord Components V2 rendering; never reads Supabase or calls Discord.
const { safeDiscord, MODES } = require('./pubg-utils');

const REFRESH_BUTTON = 'pubg:dashboard:refresh:v1';
const WEB_DASHBOARD_URL = 'https://pubg-help-clan.vercel.app/dashboard/';
const SECTIONS = ['overview', 'leaderboard', 'modes', 'roster', 'records', 'players1', 'players2', 'players3'];
const int = n => Number(n) || 0;
const number = n => int(n).toLocaleString('en-GB');
const userName = n => safeDiscord(n);

function embed(title, description, fields=[]) {
  return {
    title, description: description.slice(0,3900), color:0x263c5c,
    fields: fields.slice(0,20).map(f => ({name:f.name.slice(0,250),value:f.value.slice(0,1000),inline:f.inline??false})),
    footer:{text:'Xbox + PlayStation only · Saved Supabase statistics · Updates subject to PUBG API limits'}
  };
}
function renderDashboard(s, now = new Date()) {
  const leader = [...s.verified].sort((a,b)=>int(b.total_kills)-int(a.total_kills));
  const last = s.lastChecked ? new Date(s.lastChecked).toISOString().slice(0,16).replace('T',' ')+' UTC' : 'Not synced';
  const figures = [
    '**'+s.clan.length+'** official roster names · **'+s.verified.length+'** verified · **'+s.tracked+'** tracked outside clan',
    '**'+number(s.totals.kills)+'** kills · **'+number(s.totals.wins)+'** wins · **'+number(s.totals.matches)+'** summed player matches',
    'Xbox: **'+s.verified.filter(p=>p.platform==='xbox').length+
      '** · PlayStation: **'+s.verified.filter(p=>p.platform==='psn').length+'**',
    'Most recent saved PUBG update: '+last,
    '',
    'Use **Refresh dashboards** to check the API, save available updates to Supabase and update these eight messages.',
    '_Player totals count each player separately; squad matches may be included for multiple clan members._'
  ].join('\n');
  const leaderboard = leader.slice(0,10).map((p,i)=>
    '**'+(i+1)+'. '+userName(p.gamertag)+'** '+(p.platform==='xbox'?'(Xbox)':'(PS)')+
    ' — '+number(p.total_kills)+' kills · '+number(p.total_wins)+' wins').join('\n') || 'No verified console players yet.';
  const modeRows = MODES.map(m=>{
    const d=s.breakdown[m];
    const rate=d.rounds?(d.kills/d.rounds).toFixed(2):'N/A';
    return '**'+m.toUpperCase()+'** — '+number(d.rounds)+' played · '+
      number(d.kills)+' kills · '+number(d.wins)+' wins · '+rate+' K/game';
  }).join('\n');
  const states=s.states;
  const roster = [
    'Verified: **'+states.matched+'** / '+s.clan.length,
    'Pending names: **'+(states.pending-states.identified)+'** · Identified (stats pending): **'+states.identified+'**',
    'Ambiguous Xbox/PSN names: **'+states.ambiguous+'** · Not found: **'+states.not_found+'**',
    'Additional tracked players: **'+s.tracked+'** (excluded from official clan totals)',
    '',
    'To see each member: \`/roster\` · To search: \`/stats\` · To compare: \`/compare\`'
  ].join('\n');
  const recordRows=(s.records||[]).slice(0,8).map(r=>
    '• **'+userName(r.record_name||'Record')+'** — '+String(r.value??'N/A').slice(0,35)+
    ' · '+userName(r.holder_gamertag||'Unknown')).join('\n');
  const recent=leader.filter(p=>p.last_checked)
    .sort((a,b)=>Date.parse(b.last_checked)-Date.parse(a.last_checked))
    .slice(0,5).map(p=>'• '+userName(p.gamertag)+' — '+new Date(p.last_checked).toISOString().slice(0,16).replace('T',' ')+' UTC')
    .join('\n');
  const byGamertag = new Map(s.verified.map(p => [p.gamertag.toLowerCase(),p]));
  const allPlayers = [...s.clan].sort((a,b) => a.gamertag.localeCompare(b.gamertag,'en',{sensitivity:'base'}))
    .map((member,i)=>{
      const saved=byGamertag.get(member.gamertag.toLowerCase());
      const name=(i+1)+'. **'+userName(member.gamertag)+'**';
      if(!saved) return name+' — '+(member.status==='matched'?'Stats unavailable':
        member.status==='ambiguous'?'🎮 Console confirmation':
        member.status==='not_found'?'❓ Not found':
        member.pubg_account_id?'⏳ Stats pending':'⌛ Pending lookup');
      return name+' '+(saved.platform==='xbox'?'Xbox':'PS')+' — '+
        number(saved.total_kills)+' kills · '+number(saved.total_wins)+
        ' wins · '+number(saved.matches_played)+' matches';
    });
  const components=[{type:1,components:[{
    type:2,style:1,label:'Refresh dashboards',emoji:{name:'🔄'},custom_id:REFRESH_BUTTON
  },{type:2,style:5,label:'View full web dashboard',url:WEB_DASHBOARD_URL}]}];
  const items=[
    embed('🎮 Clan dashboard · Overview',figures),
    embed('🏆 Clan dashboard · Lifetime leaderboard',leaderboard+'\n\nUse \`/leaderboard\` for live import progress.'),
    embed('📊 Clan dashboard · Game modes',modeRows+'\n\nAll figures are sums from verified member lifetime-mode data. \`/modes\` shows individual detail.'),
    embed('👥 Clan dashboard · Roster and import progress',roster),
    embed('🎖️ Clan dashboard · Records and recent syncs',
      '**Saved clan records**\n'+(recordRows||'No custom clan records saved yet.')+
      '\n\n**Recent player updates**\n'+(recent||'None recorded')+
      '\n\nOther commands: \`/recent\`, \`/match\`, \`/squad\`, \`/mastery\`, \`/season\`, \`/ranked\`')
,
    ...[0,1,2].map(page=>embed(
      '👤 Clan dashboard · All member stats ('+(page+1)+'/3)',
      (allPlayers.slice(page*20,page*20+20).join('\n')||'No roster members on this page.')+
      '\n\n_Individual detail: /stats · /modes · /compare_'
    ))
  ];
  return Object.fromEntries(SECTIONS.map((name,i)=>[
    name,dashboardView(name,items[i],s)
  ]));
}
// Discord Components V2 (IS_COMPONENTS_V2 = 1 << 15) supports native
// coloured panels and grouped text without images or a separate website.
// Edit old embed messages in place by clearing content/embeds when setting the flag.
const V2_FLAG = 32768;
const DISPLAY = 10;
const CONTAINER = 17;
const SEPARATOR = 14;
const PALETTE = Object.freeze({
  overview: 0x5865f2, leaderboard: 0xf1c75b, modes: 0x23b79a,
  roster: 0x6e8efe, records: 0xbb80ec,
  players1: 0x657a9f, players2: 0x657a9f, players3: 0x657a9f
});
const display = content => ({ type: DISPLAY, content: String(content).slice(0, 3800) });
const rule = () => ({ type: SEPARATOR, divider: true, spacing: 1 });
function bar(progress, total, width = 12) {
  const count = total ? Math.min(width, Math.max(0, Math.round(width * progress / total))) : 0;
  return '▰'.repeat(count) + '▱'.repeat(width - count);
}
function dashboardView(name, item, state) {
  const original = item.description;
  const lines = original.split('\n');
  const title = item.title.replace('Clan dashboard · ', '');
  const components = [display('## ' + title)];
  const blocks = [];
  if (name === 'overview') {
    blocks.push('**CLAN COMMAND CENTRE**  ·  Xbox / PlayStation');
    blocks.push('### 🎯 '+number(state.totals.kills)+' kills    🏆 '+number(state.totals.wins)+' wins');
    blocks.push('**'+number(state.totals.matches)+'** player matches · **'+state.verified.length+' / '+state.clan.length+'** verified\n'+
      bar(state.verified.length, state.clan.length)+'  '+Math.round(state.clan.length?100*state.verified.length/state.clan.length:0)+'% roster complete');
    blocks.push('🎮 **Xbox:** '+state.verified.filter(p=>p.platform==='xbox').length+
      '　**PlayStation:** '+state.verified.filter(p=>p.platform==='psn').length+
      '\n🕒 Most recent saved update: '+(state.lastChecked
        ? '<t:'+Math.floor(state.lastChecked/1000)+':R>' : 'Not yet available'));
    blocks.push('_Statistics are totals across verified clan members; shared squad matches can be counted for multiple players._');
  } else if (name === 'leaderboard') {
    const ranking = lines.filter(x=>/^\*\*\d+\./.test(x));
    blocks.push('🥇 **TOP 3 PLAYERS**\n'+
      (ranking.length ? ranking.slice(0,3).map((x,i)=>['🥇 ','🥈 ','🥉 '][i]+x).join('\n') : 'No verified players yet'));
    blocks.push('**POSITIONS 4–10**\n'+(ranking.slice(3).join('\n') || 'No further verified players'));
    blocks.push('Based on lifetime kills · /leaderboard shows import progress');
  } else if (name === 'modes') {
    const groups = [lines.slice(0,3),lines.slice(3,6)];
    const modeIcons=['🎮','🎯','🛡️'];
    blocks.push('**THIRD-PERSON MODES**\n'+groups[0].map((x,i)=>modeIcons[i]+' '+x).join('\n'));
    blocks.push('**FIRST-PERSON MODES**\n'+groups[1].map((x,i)=>modeIcons[i]+' '+x).join('\n'));
    blocks.push('Totals across verified roster players · /modes for individual detail');
  } else if (name === 'roster') {
    const verified=state.verified.length;
    blocks.push('**VERIFICATION PROGRESS**\n'+bar(verified,state.clan.length,18)+
      '  **'+verified+' / '+state.clan.length+'** ('+
      Math.round(state.clan.length?100*verified/state.clan.length:0)+'%)');
    blocks.push('✅ '+state.states.matched+' verified　⏳ '+
      state.states.identified+' stats pending\n⌛ '+
      (state.states.pending-state.states.identified)+' names pending　🎮 '+
      state.states.ambiguous+' ambiguous　❓ '+state.states.not_found+' not found');
    blocks.push('**'+state.tracked+'** additional tracked accounts excluded from clan rankings\nUse /roster · /stats · /compare');
  } else if (name === 'records') {
    const parts=original.split('\n\n');
    blocks.push('🏅 **SAVED CLAN RECORDS**\n'+
      ((parts[0]||'').replace(/^\*\*Saved clan records\*\*\n?/,'').trim()||'No records saved yet'));
    blocks.push('🕒 **RECENT ACCOUNT UPDATES**\n'+
      ((parts[1]||'').replace(/^\*\*Recent player updates\*\*\n?/,'').trim()||'No recent updates'));
    blocks.push('Saved: /form · /rivals · /clanmatches · /intel\nOther: /recent · /match · /squad · /mastery · /season · /ranked');
  } else {
    const body=lines.filter(line=>/^\d+\. /.test(line));
    const page=Number(name.replace('players',''));
    blocks.push('**FULL ROSTER** · Page '+page+' of 3 · '+body.length+' member entries');
    for (let i=0;i<body.length;i+=5) {
      blocks.push('**'+(i+1)+'–'+Math.min(i+5,body.length)+'**\n'+body.slice(i,i+5).join('\n'));
    }
    if(!body.length)blocks.push('No members on this page');
    blocks.push('Individual: /stats · /form · /rivals · /modes · /compare');
  }
  // Max 10 child components per container and 40 components per message.
  // One Text Display per grouped block keeps the layout compact on mobile.
  components.push(rule());
  for (const block of blocks) {
    if (components.length>=9) break;
    components.push(display(block));
  }
  const panel={
    type:CONTAINER,
    accent_color:PALETTE[name] || 0x5865f2,
    components
  };
  return {
    flags: V2_FLAG,
    content: null,
    embeds: [],
    components: [
      panel,
      {type:1,components:[{
        type:2,style:1,label:'Refresh dashboards',
        emoji:{name:'🔄'},custom_id:REFRESH_BUTTON
      },{
        type:2,style:5,label:'View full web dashboard',
        url:WEB_DASHBOARD_URL
      },{
        type:2,style:5,label:'Match intel & scouting',
        url:WEB_DASHBOARD_URL+'#matches'
      }]}
    ],
    allowed_mentions: {parse:[]}
  };
}

module.exports = { REFRESH_BUTTON, WEB_DASHBOARD_URL, SECTIONS, renderDashboard };
