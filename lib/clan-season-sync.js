'use strict';
const {cachedEndpoint,playerEndpoint}=require('./pubg-endpoints');
const ID=/^[a-zA-Z0-9._-]{4,128}$/;
const PLAYER_ID=/^[a-zA-Z0-9._-]{8,160}$/;
const SHARDS=['xbox','psn'];
const MAX_PLAYERS=3;
const MAX_SYNC_MS=25_000;
function currentId(payload) {
  const list=payload?.data;
  if(!Array.isArray(list))return null;
  const current=list.find(x=>x?.attributes?.isCurrentSeason&&!x?.attributes?.isOffseason)||
    list.find(x=>x?.attributes?.isCurrentSeason);
  return ID.test(current?.id||'')?current.id:null;
}
async function checked(query,label){
  const result=await query;
  if(result.error)throw Error(label+': '+result.error.message);
  return result.data;
}
async function finish(db,playerId,status) {
  const delay=status==='rate_limited'?70*1000:
    status==='saved'?23*3600*1000:30*60*1000;
  await checked(db.from('clan_season_sync_state').update({
    last_finished_at:new Date().toISOString(),last_result:status,
    next_attempt_at:new Date(Date.now()+delay).toISOString()
  }).eq('player_id',playerId).select('player_id'),'Record season collection outcome');
}
async function collectClanSeasons(db,services={}) {
  const lookup=services.cachedEndpoint||cachedEndpoint;
  const playerCall=services.playerEndpoint||playerEndpoint;
  const now=services.now||Date.now;
  const summary={status:'no_work',playersAttempted:0,seasonSaved:0,
    rankedSaved:0,unavailable:0,rateLimited:false};
  if(!process.env.PUBG_API_KEY){
    summary.status='not_configured';
    return summary;
  }
  const start=now(),indexes={};
  for(let count=0;count<MAX_PLAYERS && now()-start<MAX_SYNC_MS;count++){
    const rows=await checked(db.rpc('claim_clan_season_sync'), 'Claim verified season collection');
    const player=Array.isArray(rows)?rows[0]:null;
    if(!player)break;
    summary.playersAttempted++;
    let status='unavailable',wasLimited=false;
    try{
      if(!SHARDS.includes(player.platform)||!PLAYER_ID.test(player.pubg_account_id||''))
        status='invalid_identity';
      else {
        if(!indexes[player.platform]){
          // Revalidate once per console shard; the season changes before
          // the ordinary saved 30-day index expires.
          indexes[player.platform]=await lookup(db,player.platform,'seasons',6*3600,{force:true,background:true});
        }
        const index=indexes[player.platform];
        if(index.state==='rate_limited'){
          wasLimited=true;status='rate_limited';
        }else if(index.state!=='fresh'){
          // A failed revalidation can return the previous season's stale
          // cache. Never collect/archive that ID as the new current season.
          status='season_index_unavailable';
        }else {
          const seasonId=currentId(index.data);
          if(!seasonId)status='no_current_season';
          else {
            const suffix='seasons/'+encodeURIComponent(seasonId);
            const regular=await playerCall(db,player,suffix,2*3600,{force:true,background:true});
            if(regular.state==='fresh')summary.seasonSaved++;
            if(regular.state==='rate_limited')wasLimited=true;
            if(wasLimited)status='rate_limited';
            else{
              const ranked=await playerCall(db,player,suffix+'/ranked',2*3600,{force:true,background:true});
              if(ranked.state==='fresh')summary.rankedSaved++;
              if(ranked.state==='rate_limited')wasLimited=true;
              status=wasLimited?'rate_limited':
                (regular.state==='fresh'||ranked.state==='fresh')?'saved':'unavailable';
            }
          }
        }
      }
    }catch(error){
      status='error';
      console.error('Daily clan season collection failed:',error.message);
    }
    try{await finish(db,player.player_id,status)}
    catch(error){console.error('Season collection result unavailable:',error.message)}
    if(status==='rate_limited'){
      summary.rateLimited=true;
      break;
    }
    if(status!=='saved')summary.unavailable++;
  }
  summary.status=summary.rateLimited?'rate_limited':
    summary.playersAttempted?'processed':'no_work';
  return summary;
}
module.exports={collectClanSeasons,currentId,MAX_PLAYERS};
