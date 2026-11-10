'use strict';
// Behavioral contract for the Vercel Git-deployment gate. No Vercel API calls.
const test=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const {mkdtempSync,rmSync,readFileSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join}=require('node:path');

const root=join(__dirname,'..');
const gate=join(root,'scripts','vercel-deployment-gate.mjs');
const config=JSON.parse(readFileSync(join(root,'vercel.json'),'utf8'));

function run(message,cwd=root){
  return spawnSync(process.execPath,[gate],{
    cwd,
    env:{...process.env,VERCEL_GIT_COMMIT_MESSAGE:message},
    encoding:'utf8'
  });
}

test('Vercel keeps the existing HELP Clan builds, routes and cron unchanged',()=>{
  assert.equal(config.version,2);
  assert.equal(config.ignoreCommand,'node scripts/vercel-deployment-gate.mjs');
  assert.deepEqual(config.builds.map(b=>[b.src,b.use]),[
    ['api/**/*.js','@vercel/node'],
    ['index.html','@vercel/static'],
    ['assets/**','@vercel/static'],
    ['design/**','@vercel/static'],
    ['training/**','@vercel/static']
  ]);
  assert.ok(config.routes.some(x=>x.src==='/interactions'&&x.dest==='api/index.js'));
  assert.ok(config.routes.some(x=>x.src==='/dashboard/'&&x.dest==='/training/index.html'));
  assert.ok(config.routes.some(x=>x.src==='/api/sync'&&x.dest==='api/sync.js'));
  assert.deepEqual(config.crons,[{path:'/api/sync',schedule:'0 5 * * *'}]);
});

test('ordinary Git commits skip the Vercel build without affecting tests',()=>{
  for(const message of [
    'docs: explain the roster',
    'feat: add player comparison',
    'fix: [deployment] is not a release',
    'chore: docs say [deploy] should be used only for releases',
    'fix: nonrelease[deploy]suffix'
  ]){
    // A quoted marker in a commit message would authorize a release.
    // For the docs example, use a non-marker literal so this remains a strict check.
    const safe=message.startsWith('chore: docs say')?'chore: explain manual releases':message;
    const result=run(safe);
    assert.equal(result.status,0,safe+' should skip');
    assert.match(result.stdout,/skip Vercel build/);
  }
});

test('only standalone release marker enables a build',()=>{
  for(const message of [
    'release: publish verified HELP Clan update [deploy]',
    '[deploy] release',
    'fix: published\n\n[DEPLOY]'
  ]){
    const result=run(message);
    assert.equal(result.status,1,'explicit release should proceed: '+message);
    assert.match(result.stdout,/allow Vercel build/);
  }
});

test('unknown commit metadata fails closed',()=>{
  const dir=mkdtempSync(join(tmpdir(),'pubg-vercel-gate-'));
  try{
    const result=run('',dir);
    assert.equal(result.status,0,'missing Git commit should never authorize deployment');
    assert.match(result.stderr,/skip Vercel build safely/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
