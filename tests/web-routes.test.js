'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
test('website and all existing bot endpoints share a single Vercel deployment',()=>{
 const v=JSON.parse(read('vercel.json'));
 const routes=Object.fromEntries(v.routes.map(x=>[x.src,x.dest]));
 assert.equal(routes['/'],'/training/index.html');
 assert.equal(routes['/dashboard/'],'/training/index.html');
 assert.equal(routes['/interactions'],'api/index.js');
 assert.equal(routes['/api/sync'],'api/sync.js');
 assert.equal(routes['/api/health'],'api/health.js');
 assert.equal(routes['/api/public-stats'],'api/public-stats.js');
 assert.equal(routes['/api/player-history'],'api/player-history.js');
 assert.equal(routes['/api/player-lookup'],'api/player-lookup.js');
 assert.equal(routes['/api/player-refresh'],'api/player-refresh.js');
 assert.equal(routes['/api/public-season'],'api/public-season.js');
 assert.equal(routes['/api/public-season-leaderboard'],'api/public-season-leaderboard.js');
 assert.equal(routes['/api/public-progress'],'api/public-progress.js');
 assert.equal(routes['/api/public-matches'],'api/public-matches.js');
 assert.equal(routes['/api/public-insights'],'api/public-insights.js');
 assert.equal(routes['/api/public-source'],'api/public-insights.js');
 assert.equal(routes['/api/public-telemetry'],'api/public-matches.js');
 assert.equal(routes['/api/public-global-leaderboard'],'api/public-insights.js');
 assert.ok(v.builds.some(x=>x.src==='index.html'&&x.use==='@vercel/static'));
 assert.ok(v.builds.some(x=>x.src==='assets/**'&&x.use==='@vercel/static'));
 assert.equal(v.crons[0].path,'/api/sync');
});
test('static web app assets and original reference pictures are present',()=>{
 const index=read('training/index.html');
 assert.match(index,/clan-dashboard-scoped\.css/);
 assert.match(read('training/js/clan-dashboard-loader.js'),/\/assets\/site\.js/);
 for(const page of ['overview','leaderboard','players','modes','matches','weapons','season','teammates','compare','awards','analysis','data-tools','help','survival','sources','global','health','roadmap'])
   assert.ok(index.includes('id="page-'+page+'"'),page);
 for(const f of ['assets/site.css','assets/site.js','assets/brand.svg',
  'design/overview-reference.svg','design/leaderboard-reference.svg','ROADMAP.md'])
   assert.ok(read(f).length>100,'Missing asset '+f);
 const js=read('assets/site.js');
 assert.match(js,/\/api\/public-stats/);
 assert.match(js,/\/api\/player-lookup/);
 assert.match(js,/\/api\/player-history/);
 assert.match(js,/\/api\/public-matches/);
 assert.match(js,/\/api\/public-insights/);
 assert.match(js,/\/api\/player-refresh/);
 assert.match(js,/\/api\/public-season/);
 assert.match(index,/id="match-refresh"/);
 assert.match(index,/id="weapons-refresh"/);
 assert.match(index,/id="season-refresh"/);
 assert.match(js,/#player\//);
 assert.doesNotMatch(js,/SUPABASE_SERVICE_KEY|PUBG_API_KEY|DISCORD_BOT_TOKEN/);
});

test('old command centre features are present without shipping fixtures or secrets',()=>{
 const html=read('training/index.html'),js=read('assets/command-centre.js'),math=read('assets/clan-analytics.js');
 for(const id of ['cc-awards-grid','cc-scores','cc-progress','cc-quality','compare-radar',
  'cc-export','cc-before-file','cc-after-file','cc-scatter','cc-min-matches','cc-team-weight'])
   assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(read('training/js/clan-dashboard-loader.js'),/clan-analytics\.js/);
 assert.match(read('training/js/clan-dashboard-loader.js'),/command-centre\.js/);
 assert.match(js,/\/api\/public-progress/);
 assert.match(js,/local-only|local-only|Local-only/i);
 assert.doesNotMatch(html+js+math,/SUPABASE_SERVICE_KEY|PUBG_API_KEY|DISCORD_BOT_TOKEN|window\.storage/);
 assert.doesNotMatch(math,/Big_SnakeAUG|PUBGClans.net|isBotFarmer/);
});


test('combat intelligence keeps event/rival tools but permanently excludes 2D replays',()=>{
  const html=read('training/index.html'),ui=read('assets/telemetry-view.js');
  for(const id of ['telemetry-panel','telemetry-match','telemetry-load','telemetry-report',
   'telemetry-event-list','telemetry-rivals-table','telemetry-event-export'])
   assert.ok(html.includes('id="'+id+'"'),id);
  for(const id of ['telemetry-time','telemetry-zoom','telemetry-track','telemetry-map','telemetry-play'])
   assert.ok(!html.includes('id="'+id+'"'),'Obsolete replay control '+id);
  assert.match(read('training/js/clan-dashboard-loader.js'),/assets\\/telemetry-view\\.js/);
  assert.match(ui,/\\/api\\/public-telemetry/);
  assert.doesNotMatch(ui,/requestAnimationFrame|data-telemetry-jump|<svg/);
  assert.doesNotMatch(html+ui,/SUPABASE_SERVICE_KEY|PUBG_API_KEY|DISCORD_BOT_TOKEN/);
});

test('free Hobby Vercel deployment stays within 12 serverless function builds',()=>{
 const files=fs.readdirSync(path.join(root,'api')).filter(f=>f.endsWith('.js'));
 assert.ok(files.length<=12,'Hobby permits at most 12 functions, found '+files.length);
 const routes=JSON.parse(read('vercel.json')).routes;
 for(const route of routes)if(/^\/api\//.test(route.src))
  assert.ok(files.includes(route.dest.split('/').at(-1)),'Route lacks compiled function: '+route.src);
 const source=read('api/public-insights.js'),matches=read('api/public-matches.js');
 assert.match(source,/publicSource/);
 assert.match(source,/officialLeaderboard/);
 assert.match(matches,/publicTelemetry/);
 assert.match(read('assets/source-explorer.js'),/route:'source'/);
 assert.match(read('assets/global-board.js'),/route:'global'/);
 assert.match(read('assets/telemetry-view.js'),/route:'telemetry'/);
 assert.match(matches,/publicClanMatchBoard/);
 assert.match(read('assets/clan-match-board.js'),/route=clan-board/);
 assert.match(matches,/publicClanActivity/);
 assert.match(read('assets/clan-activity-pulse.js'),/route=clan-activity/);
 assert.match(read('training/js/clan-dashboard-loader.js'),/assets\/clan-activity-pulse\.js/);
 for(const id of ['clan-pulse-chart','clan-pulse-days','clan-pulse-metric','clan-pulse-table'])
  assert.match(read('training/index.html'),new RegExp('id="'+id+'"'));
 assert.match(read('training/js/clan-dashboard-loader.js'),/assets\/clan-match-board\.js/);
 assert.match(matches,/publicClanMatchRecords/);
 assert.match(matches,/publicMatchLobby/);
 assert.match(read('training/js/clan-dashboard-loader.js'),/assets\/match-lobby\.js/);
 assert.match(read('assets/clan-record-book.js'),/route=clan-records/);
 assert.match(read('training/js/clan-dashboard-loader.js'),/assets\/clan-record-book\.js/);
 for(const id of ['clan-record-days','clan-record-kpis','clan-record-metrics',
  'clan-record-table','clan-record-description'])
   assert.match(read('training/index.html'),new RegExp('id="'+id+'"'));
});


test('Survival Mastery reuses the existing insight and player-refresh functions',()=>{
 const html=read('index.html'),view=read('assets/survival-view.js');
 for(const id of ['survival-name','survival-known','survival-load',
  'survival-refresh','survival-data','survival-status'])
  assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(html,/assets\/survival-view\.js/);
 assert.match(view,/\/api\/public-insights/);
 assert.match(view,/\/api\/player-refresh/);
 assert.match(read('lib/web-refresh.js'),/survival_mastery/);
 assert.match(read('lib/web-insights.js'),/survivalFields/);
 assert.doesNotMatch(html+view,/SUPABASE_SERVICE_KEY|PUBG_API_KEY/);
});

test('health panel and privacy-safe aggregate route reuse the existing backend',()=>{
 const index=read('index.html'),view=read('assets/cache-health.js');
 for(const id of ['health-metrics','health-types','health-refresh','health-status','health-source-note'])
  assert.ok(index.includes('id="'+id+'"'));
 assert.match(view,/fetch\('\/api\/health\?collection=1'/);
 assert.match(read('api/health.js'),/getCollectionHealth/);
 assert.match(read('training/index.html'),/id="health-backfill-table"/);
 assert.match(read('training/index.html'),/id="health-freshness-metrics"/);
 assert.match(read('api/health.js'),/getCacheHealth/);
 assert.doesNotMatch(index+view,/SUPABASE_SERVICE_KEY|PUBG_API_KEY/);
});

test('bar graphs set measured CSSOM dimensions without blocked inline style attributes',()=>{
 const app=read('assets/site.js'),page=read('index.html'),
   weapons=read('assets/weapon-explorer.js');
 assert.doesNotMatch(app+weapons,/<span style=/);
 assert.doesNotMatch(app+weapons,/<span class="bar-actual" style=/);
 assert.match(app,/el\.style\.height=el\.dataset\.height/);
 assert.match(weapons,/e\.style\.width=e\.dataset\.width/);
 assert.match(page,/style-src 'self'/);
});
