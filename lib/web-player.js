'use strict';
const {escapeLike, MODES}=require('./pubg-utils');
const {whitelistStats,summarizeAdvanced}=require('./web-stats');
const PLATFORMS=new Set(['xbox','psn']);
const VALID_NAME=/^[^,\u0000-\u001f\u007f]{1,100}$/;
const REFRESH_FRESH_MS=2*60*1000;
function validInput(name,platform='auto'){
 return typeof name==='string'&&name.trim()===name&&VALID_NAME.test(name) &&
   typeof platform==='string'&&(platform==='auto'||PLATFORMS.has(platform));
}
async function checked(query){
 const r=await query;
 if(r.error)throw new Error('Saved PUBG player data is temporarily unavailable');
 return r.data;
}
async function publicPlayer(db,name,platform='auto'){
 if(!validInput(name,platform))
   return{status:400,body:{error:'Choose a valid player name and console'}};
 const saved=await checked(db.from('players')
   .select('id,gamertag,platform,total_kills,total_wins,matches_played,last_checked')
   .ilike('gamertag',escapeLike(name)).limit(20));
 const exact=(saved||[]).filter(p=>p.gamertag?.toLowerCase()===name.toLowerCase());
 const consoles=[...new Set(exact.filter(p=>PLATFORMS.has(p.platform)).map(p=>p.platform))];
 // Never silently choose the first account when a name belongs to both consoles.
 if(platform==='auto'&&consoles.length>1)
   return{status:409,body:{
     error:'This saved gamertag exists on Xbox and PlayStation. Choose the correct console to view its statistics.',
     code:'platform_ambiguous',name,choices:consoles
   }};
 const match=platform==='auto'?exact.find(p=>PLATFORMS.has(p.platform)):
   exact.find(p=>p.platform===platform);
 if(!match){
   if(exact.some(p=>PLATFORMS.has(p.platform)))
     return{status:409,body:{error:'This gamertag is already saved on '+(exact[0]?.platform==='xbox'?'Xbox':'PlayStation')+'. Choose that console, or use Auto-detect.',name,platform,suggestedPlatform:exact[0]?.platform}};
   return{status:200,body:{schemaVersion:1,found:false,name,platform,isClanMember:false,
     note:'No saved account found. Select Refresh from PUBG to check Xbox and PlayStation and save the confirmed account.'}};
 }
 const [details,roster]=await Promise.all([
   checked(db.from('player_lifetime_details').select('game_mode_stats')
     .eq('player_id',match.id).maybeSingle()),
   checked(db.from('player_import_queue').select('gamertag,status,platform,is_clan_member')
     .ilike('gamertag',escapeLike(name)).limit(20))
 ]);
 const source=details?.game_mode_stats||{},modes={};
 for(const mode of MODES)if(source[mode])modes[mode]=whitelistStats(source[mode]);
 const kills=Math.max(0,Number(match.total_kills)||0),
   wins=Math.max(0,Number(match.total_wins)||0),
   games=Math.max(0,Number(match.matches_played)||0);
 const isClanMember=(roster||[]).some(r=>r.is_clan_member===true&&r.status==='matched' &&
   r.gamertag?.toLowerCase()===name.toLowerCase() &&
   (!r.platform||r.platform===match.platform));
 return{status:200,body:{
   schemaVersion:1,found:true,name:match.gamertag,platform:match.platform,
   isClanMember,source:'Saved Supabase PUBG lifetime data',
   player:{name:match.gamertag,platform:match.platform,
     kills,wins,matches:games,kd:games?Number((kills/games).toFixed(3)):null,
     winRate:games?Number((100*wins/games).toFixed(2)):null,
     updatedAt:match.last_checked||null,modes,advanced:summarizeAdvanced(modes)}
 }};
}
module.exports={publicPlayer,validInput,REFRESH_FRESH_MS};
