'use strict';
// Signed Discord interaction only. The database service role is never exposed
// to Discord users, the website, or other guilds.
const {escapeLike,safeDiscord}=require('./pubg-utils');
const GUILD='1411949587299569788';
const SNOWFLAKE=/^\d{16,22}$/;
const NAME=/^[^,\u0000-\u001f\u007f]{1,100}$/;
const SUBCOMMANDS=new Set(['add','remove','status','audit']);
function canManage(body){
 if(body?.guild_id!==GUILD||!SNOWFLAKE.test(body?.id||'')||
  !SNOWFLAKE.test(body?.member?.user?.id||''))return false;
 const raw=body.member?.permissions;
 if(typeof raw!=='string'||!/^\d{1,20}$/.test(raw))return false;
 try{
  const flags=BigInt(raw);
  return Boolean((flags&8n)!==0n||(flags&32n)!==0n);
 }catch{return false;}
}
function validName(name){
 return typeof name==='string'&&NAME.test(name)&&name===name.trim();
}
function clean(value){
 return safeDiscord(value).replace(/@/g,'@\u200b');
}
function option(body,name){
 const action=body?.data?.options?.[0];
 return action?.options?.find?.(item=>item.name===name)?.value;
}
function actionName(body){
 const value=body?.data?.options?.[0];
 return value?.type===1&&SUBCOMMANDS.has(value.name)?value.name:null;
}
function formatMutation(result,action){
 const name=result?.gamertag?clean(result.gamertag):'that player';
 if(result?.status==='added')
  return '✅ Added **'+name+'** to the official clan roster.\n'+
   (result.verification==='matched'?
    'Existing confirmed console statistics remain linked.':
    'PUBG console identity is not fully verified yet. The existing shared-budget importer will attempt verification; no PUBG calls were made by this command.')+
   '\nUse /roster to check import progress.';
 if(result?.status==='removed')
  return '✅ Removed **'+name+'** from the official clan roster. The saved player profile and historical statistics were retained.';
 if(result?.status==='unchanged')
  return 'ℹ️ **'+name+'** already has the requested clan membership setting. No changes were made.';
 if(result?.status==='duplicate')
  return 'ℹ️ This Discord interaction was already processed. No second roster change was made.';
 if(result?.status==='not_found')
  return '🔎 No tracked player with that exact visible name was found. Nothing was removed.';
 if(result?.status==='ambiguous')
  return '⚠️ Multiple stored names differ only by case. No roster change was made; resolve the duplicate identity privately.';
 return '⚠️ Roster change was not accepted. Check the name and try again.';
}
async function readStatus(db,name){
 const query=db.from('player_import_queue')
  .select('gamertag,status,platform,is_clan_member,checked_at')
  .ilike('gamertag',escapeLike(name)).limit(15);
 const result=await query;
 if(result.error)throw Error('Cannot read roster status');
 const exact=(result.data||[]).filter(row=>row.gamertag?.toLowerCase()===name.toLowerCase());
 if(exact.length>1)return '⚠️ Multiple saved names differ only in capitalization; roster identity must be resolved privately.';
 if(!exact.length)return '🔎 **'+clean(name)+'** is not tracked yet. Use /clanmanage add to queue a verified clan lookup.';
 const row=exact[0];
 return '👥 **'+clean(row.gamertag)+'**\nOfficial clan member: **'+
  (row.is_clan_member?'Yes':'No')+'** · PUBG verification: **'+
  (['matched','pending','not_found','ambiguous','error'].includes(row.status)?
   row.status:'unknown')+'** · Console: **'+
  (row.platform==='xbox'?'Xbox':row.platform==='psn'?'PlayStation':'not yet verified')+
  '**\nChecking a player's identity uses the existing shared PUBG API budget; admin commands do not trigger a lookup.';
}
async function readAudit(db,count){
 const result=await db.from('clan_membership_audit')
  .select('gamertag,action,actor_discord_id,previous_membership,current_membership,occurred_at')
  .order('occurred_at',{ascending:false}).limit(count);
 if(result.error)throw Error('Roster change history unavailable');
 const rows=(result.data||[]).slice(0,count);
 if(!rows.length)return '📋 No Discord clan-membership changes have been recorded yet.';
 return '📋 **Last '+rows.length+' clan roster change(s)**\n'+rows.map((row,i)=>{
  const when=typeof row.occurred_at==='string'&&Number.isFinite(Date.parse(row.occurred_at))?
   new Date(row.occurred_at).toISOString().slice(0,16).replace('T',' ')+' UTC':'unknown time';
  return (i+1)+'. '+(row.action==='add'?'Added':'Removed')+' **'+
   clean(row.gamertag)+'** · '+when+' · manager …'+
   String(row.actor_discord_id||'').slice(-4);
 }).join('\n')+'\nThis is the private admin audit; public profiles are not changed when somebody leaves the clan.';
}
async function command(db,body){
 if(!canManage(body))
  return '⛔ You need **Manage Server** or **Administrator** permission in the official clan Discord server.';
 const action=actionName(body);
 if(!action)return 'Choose /clanmanage add, remove, status or audit.';
 if(action==='audit'){
  const raw=option(body,'count');
  const count=raw===undefined?5:Number(raw);
  if(!Number.isInteger(count)||count<1||count>10)
   return 'Choose 1–10 audit entries.';
  return readAudit(db,count);
 }
 const name=option(body,'gamertag');
 if(!validName(name))
  return 'Enter one exact Xbox or PlayStation gamertag (no commas or control characters).';
 if(action==='status')return readStatus(db,name);
 const result=await db.rpc('manage_discord_clan_membership',{
  p_interaction_id:body.id,
  p_actor_discord_id:body.member.user.id,
  p_guild_id:body.guild_id,
  p_gamertag:name,
  p_action:action
 });
 if(result.error)throw Error('Secure clan roster change unavailable');
 return formatMutation(result.data,action);
}
module.exports={command,canManage,validName,actionName,formatMutation,readStatus,readAudit,GUILD};
