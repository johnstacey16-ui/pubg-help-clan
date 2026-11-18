'use strict';
const {escapeLike}=require('./pubg-utils');
const {selectSavedConsoleAccount}=require('./saved-console-account');
const {cachedEndpoint,playerEndpoint,matchEndpoint}=require('./pubg-endpoints');

const SCOPES=Object.freeze(['weapons','survival','matches','season','ranked']);
const PLATFORMS=Object.freeze(['xbox','psn']);
const MATCH_ID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const SEASON_ID=/^[a-zA-Z0-9._-]{4,128}$/;
const NAME=/^[^,\u0000-\u001f\u007f]{1,100}$/;
const MATCH_LIMIT=5;
function validRefresh({name,platform='auto',scope}={}) {
  return typeof name==='string' && name.trim()===name && NAME.test(name) &&
    (platform==='auto'||PLATFORMS.includes(platform)) && SCOPES.includes(scope);
}
async function read(query) {
  const r=await query;
  if(r.error)throw Error('Saved player information unavailable');
  return r.data;
}
async function savedPlayer(db,name,platform) {
  const players=await read(db.from('players').select('gamertag,platform,pubg_account_id')
    .ilike('gamertag',escapeLike(name)).limit(10));
  const resolved=selectSavedConsoleAccount(players,name,platform);
  if(resolved.status===404)
    return{status:404,body:{error:'No confirmed PUBG account saved yet. Search and refresh the player’s lifetime profile first.'}};
  return resolved;
}
function respondToUpstream(response,scope,player,more={}) {
  if(!response?.data) {
    return{status:response?.state==='rate_limited'?429:
      response?.state==='not_found'?404:503,
      body:{error:scope+' data is unavailable ('+(response?.state||'unknown')+'). Saved information has not been erased.',
        retryAfterSeconds:response?.state==='rate_limited'?90:undefined}};
  }
  return{status:200,body:{
    schemaVersion:1,name:player.gamertag,platform:player.platform,scope,
    state:response.state,
    note:response.state==='fresh'
      ? 'PUBG data fetched and saved to the shared Supabase cache.'
      : response.state==='cached'
        ? 'Saved PUBG cache is still current; no upstream request was needed.'
        : 'Showing an older saved PUBG result because live data is unavailable.',
    ...more
  }};
}
async function refreshScopedData(db,params,services={}) {
  if(!validRefresh(params))return{status:400,body:{error:'Enter one gamertag, an optional console and a supported refresh type.'}};
  const {name,scope}=params;
  const resolved=await savedPlayer(db,name,params.platform||'auto');
  if(!resolved.player)return resolved;
  const player=resolved.player;
  // Per-scope per-player cooldown + globally shared web limiter.
  // PUBG's existing reserve_pubg_requests RPC remains the final authority.
  const limiter=await db.rpc('reserve_web_refresh',{
    p_player_key:player.platform+':'+scope+':'+player.gamertag.toLowerCase()
  });
  if(limiter.error)throw Error('Public website refresh limit unavailable');
  if(!limiter.data)return{status:429,body:{
    error:'Public website refresh is cooling down. Your saved statistics remain accessible.',
    retryAfterSeconds:90
  }};
  const endpoint=services.playerEndpoint||playerEndpoint;
  const cache=services.cachedEndpoint||cachedEndpoint;
  const match=services.matchEndpoint||matchEndpoint;
  if(scope==='weapons') {
    const response=await endpoint(db,player,'weapon_mastery',3*3600,{force:true});
    return respondToUpstream(response,scope,player,{
      next:'Read the updated Weapon Mastery page'
    });
  }
  if(scope==='survival') {
    const response=await endpoint(db,player,'survival_mastery',3*3600,{force:true});
    return respondToUpstream(response,scope,player,{
      next:'Read the updated Survival Mastery page'
    });
  }
  if(scope==='matches') {
    // One rate-limited player-index request; no more than five free match details.
    const index=await endpoint(db,player,'',15*60,{force:true});
    if(!index.data)return respondToUpstream(index,scope,player);
    const raw=index.data?.data?.relationships?.matches?.data;
    const ids=Array.isArray(raw)?[...new Set(raw.map(m=>m?.id)
      .filter(id=>typeof id==='string'&&MATCH_ID.test(id)))].slice(0,MATCH_LIMIT):[];
    // One missing detail must not discard the other successfully saved matches.
    const results=await Promise.allSettled(ids.map(id=>match(db,id)));
    return respondToUpstream(index,scope,player,{
      indexedMatches:ids.length,
      savedDetails:results.filter(item=>item.status==='fulfilled'&&Boolean(item.value?.data)).length,
      next:'Open Match Intelligence to review cached reports'
    });
  }
  // Season and ranked stats share a current-season lookup; explicitly
  // refresh its cache because the old 30-day TTL can span a season change.
  const seasons=await cache(db,player.platform,'seasons',6*3600,{force:true});
  if(!seasons.data)return respondToUpstream(seasons,scope,player);
  const list=Array.isArray(seasons.data.data)?seasons.data.data:[];
  const current=list.find(row=>row?.attributes?.isCurrentSeason&&!row?.attributes?.isOffseason) ||
    list.find(row=>row?.attributes?.isCurrentSeason);
  if(!current?.id||!SEASON_ID.test(current.id))
    return{status:404,body:{error:'PUBG has not identified a current console season.'}};
  const suffix='seasons/'+encodeURIComponent(current.id)+(scope==='ranked'?'/ranked':'');
  const result=await endpoint(db,player,suffix,2*3600,{force:true});
  return respondToUpstream(result,scope,player,{
    seasonId:current.id,seasonState:seasons.state,
    next:'Open the Season & Ranked page to inspect saved game-mode statistics'
  });
}
module.exports={refreshScopedData,validRefresh,savedPlayer,SCOPES,MATCH_LIMIT,respondToUpstream};
