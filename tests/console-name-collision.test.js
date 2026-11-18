'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {refreshScopedData}=require('../lib/web-refresh');
const {savedSeason}=require('../lib/web-season');
const {selectSavedConsoleAccount}=require('../lib/saved-console-account');

const xbox={id:11,gamertag:'SharedTag',platform:'xbox',pubg_account_id:'account.XBOXIDENTITY123'};
const psn={id:12,gamertag:'SharedTag',platform:'psn',pubg_account_id:'account.PSNIDENTITY123'};

function fakeDb(players=[xbox,psn]){
  const calls=[];
  return{
    calls,
    from(table){
      calls.push({table});
      return{
        select(){return this},
        ilike(){return this},
        eq(){return this},
        order(){return this},
        async limit(){
          return{data:table==='players'?players:[],error:null};
        },
        async maybeSingle(){return{data:null,error:null}}
      };
    },
    async rpc(method,args){
      calls.push({method,args});
      return{data:true,error:null};
    }
  };
}

test('auto console collision cannot spend PUBG budget or select a random account',async()=>{
  const db=fakeDb();
  const services={playerEndpoint:async()=>{throw Error('Never call PUBG for an ambiguous account')}};
  const refresh=await refreshScopedData(db,{name:'SharedTag',platform:'auto',scope:'weapons'},services);
  assert.equal(refresh.status,409);
  assert.equal(refresh.body.code,'platform_ambiguous');
  assert.deepEqual(refresh.body.choices,['xbox','psn']);
  assert.deepEqual(db.calls,[{table:'players'}]);
  assert.doesNotMatch(JSON.stringify(refresh.body),/account\.|pubg_account_id/);

  const seasonal=await savedSeason(db,{name:'SharedTag',platform:'auto',type:'ranked'});
  assert.equal(seasonal.status,409);
  assert.deepEqual(seasonal.body.choices,['xbox','psn']);
  assert.equal(db.calls.length,2);
  assert.deepEqual(db.calls.map(c=>c.table),['players','players']);
});

test('explicit PSN chooses the second saved row for refresh and season history',async()=>{
  const db=fakeDb(),requests=[];
  const result=await refreshScopedData(db,{name:'SharedTag',platform:'psn',scope:'weapons'},{
    playerEndpoint:async(_db,player,endpoint)=>{
      requests.push({player,endpoint});
      return{state:'fresh',data:{data:{}}};
    }
  });
  assert.equal(result.status,200);
  assert.equal(result.body.platform,'psn');
  assert.equal(requests.length,1);
  assert.equal(requests[0].player.pubg_account_id,psn.pubg_account_id);
  assert.equal(requests[0].endpoint,'weapon_mastery');
  assert.deepEqual(db.calls.find(c=>c.method==='reserve_web_refresh').args,
    {p_player_key:'psn:weapons:sharedtag'});

  const season=await savedSeason(db,{name:'SharedTag',platform:'psn',type:'ranked'});
  assert.equal(season.status,200);
  assert.equal(season.body.platform,'psn');
  assert.equal(season.body.count,0);
  assert.equal(season.body.historyCount,0);
  assert.equal(db.calls.filter(c=>c.table==='player_season_snapshots').length,1);
  assert.doesNotMatch(JSON.stringify(season.body),/account\.|pubg_account_id/);
});

test('explicit Xbox still resolves its own account, never the other console',async()=>{
  const db=fakeDb(),requests=[];
  const result=await refreshScopedData(db,{name:'SharedTag',platform:'xbox',scope:'survival'},{
    playerEndpoint:async(_db,player,endpoint)=>{
      requests.push({player,endpoint});
      return{state:'cached',data:{data:{}}};
    }
  });
  assert.equal(result.status,200);
  assert.equal(requests[0].player.pubg_account_id,xbox.pubg_account_id);
  assert.equal(requests[0].endpoint,'survival_mastery');
  assert.deepEqual(db.calls.find(c=>c.method==='reserve_web_refresh').args,
    {p_player_key:'xbox:survival:sharedtag'});
});

test('mismatched console and invalid source identity cannot trigger a refresh',async()=>{
  const db=fakeDb([xbox]);
  const missing=await refreshScopedData(db,{name:'SharedTag',platform:'psn',scope:'weapons'});
  assert.equal(missing.status,409);
  assert.equal(missing.body.suggestedPlatform,'xbox');
  const season=await savedSeason(db,{name:'SharedTag',platform:'psn'});
  assert.equal(season.status,409);
  assert.equal(season.body.suggestedPlatform,'xbox');
  assert.equal(db.calls.some(c=>c.method),false);

  const corrupt=selectSavedConsoleAccount([
    {...psn,pubg_account_id:'invalid/account'},xbox
  ],'sharedtag','auto');
  assert.equal(corrupt.player.pubg_account_id,xbox.pubg_account_id);
  const empty=selectSavedConsoleAccount([{...psn,pubg_account_id:''}],'SharedTag');
  assert.equal(empty.status,404);
});

test('season browser requests include selected console instead of implicit auto',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../assets/site.js'),'utf8');
  assert.match(source,/platform=findPlayer\(name\)\?\.platform\|\|'auto'/);
  assert.match(source,/\&platform='\+encodeURIComponent\(platform\)/);
});
