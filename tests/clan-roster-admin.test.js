'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const path=require('node:path');
const admin=require('../lib/clan-roster-admin');
const {commands,VERSION}=require('../lib/command-definitions');
const GUILD='1411949587299569788',actor='123456789012345678';
function message(sub='add',name='Clan Member',permissions='32'){
 return{
  id:'123456789012345679',guild_id:GUILD,
  member:{user:{id:actor},permissions},
  data:{name:'clanmanage',options:[{type:1,name:sub,options:
   sub==='audit'?[{type:4,name:'count',value:5}]:
   [{type:3,name:'gamertag',value:name}]}]}
 };
}
function fakeDb({row=null,history=null,response=null,error=false}={}){
 const calls=[];
 const db={calls,rpc:async(name,args)=>{
  calls.push(['rpc',name,args]);
  return{error:error?{message:'failure'}:null,
   data:response||{status:'added',gamertag:args.p_gamertag,
    isClanMember:true,verification:'pending',platform:null}};
 },from(table){
  calls.push(['from',table]);
  return{
   select(fields){calls.push(['select',fields]);return this;},
   ilike(field,value){calls.push(['ilike',field,value]);return this;},
   order(field,option){calls.push(['order',field,option]);return this;},
   async limit(n){calls.push(['limit',n]);return{
    data:table==='clan_membership_audit'?(history||[]):
     row===null?[]:[row],error:error?{message:'unavailable'}:null};}
  };
 }};
 return db;
}
test('Discord registry adds restricted subcommands without changing existing commands',()=>{
 assert.equal(commands.length,17);
 assert.match(VERSION,/roster-admin/);
 const cmd=commands.find(x=>x.name==='clanmanage');
 assert.equal(cmd.default_member_permissions,'32');
 assert.deepEqual(cmd.options.map(x=>x.name),['add','remove','status','audit']);
 assert.equal(cmd.options.every(x=>x.type===1),true);
 for(const sub of cmd.options){
  assert.equal(sub.options.length,1);
  if(sub.name==='audit')assert.equal(sub.options[0].required,false);
  else assert.equal(sub.options[0].required,true);
 }
 assert.equal(new Set(commands.map(c=>c.name)).size,17);
});
test('authorization requires signed guild identity and Manage Guild/Administrator, not Manage Channels',()=>{
 assert.equal(admin.canManage(message()),true);
 assert.equal(admin.canManage(message('add','Clan Member','8')),true);
 assert.equal(admin.canManage(message('add','Clan Member','40')),true);
 for(const permissions of ['0','16','1024','-32','32.0','invalid',null]){
  assert.equal(admin.canManage(message('add','Name',permissions)),false,String(permissions));
 }
 const wrong=message();wrong.guild_id='111111111111111111';
 assert.equal(admin.canManage(wrong),false);
 wrong.guild_id=GUILD;wrong.member.user.id='not-a-real-snowflake';
 assert.equal(admin.canManage(wrong),false);
 wrong.member.user.id=actor;wrong.id='also-invalid';
 assert.equal(admin.canManage(wrong),false);
});
test('rejected admin identity and malformed name cause no database calls',async()=>{
 for(const permissions of ['0','16','invalid']){
  const db=fakeDb(),reply=await admin.command(db,message('add','Member',permissions));
  assert.match(reply,/Manage Server/);
  assert.equal(db.calls.length,0);
 }
 for(const name of ['','  Name','Name  ','A,B','foo\nbar','x'.repeat(101)]){
  const db=fakeDb(),reply=await admin.command(db,message('add',name));
  assert.match(reply,/one exact/);
  assert.equal(db.calls.length,0,name);
 }
 const db=fakeDb(),input=message('delete');
 assert.match(await admin.command(db,input),/add, remove, status or audit/);
 assert.equal(db.calls.length,0);
});
test('verified manager add sends only exact guild actor and interaction to service-only RPC',async()=>{
 const db=fakeDb();
 const reply=await admin.command(db,message('add','New PUBG Player'));
 assert.match(reply,/Added/);
 assert.match(reply,/awaiting|not fully verified/);
 assert.equal(db.calls.length,1);
 assert.deepEqual(db.calls[0],['rpc','manage_discord_clan_membership',{
  p_interaction_id:'123456789012345679',p_actor_discord_id:actor,
  p_guild_id:GUILD,p_gamertag:'New PUBG Player',p_action:'add'
 }]);
 assert.doesNotMatch(reply,/account\.|SUPABASE_SERVICE_KEY|PUBG_API_KEY|<@/);
});
test('membership removal keeps player stats and verifies in Discord text',async()=>{
 const db=fakeDb({response:{
  status:'removed',gamertag:'Former Member',isClanMember:false,
  verification:'matched',platform:'xbox'
 }});
 const reply=await admin.command(db,message('remove','Former Member'));
 assert.match(reply,/Removed/);
 assert.match(reply,/historical statistics were retained/);
 assert.equal(db.calls[0][2].p_action,'remove');
});
test('status queries are exact-case-insensitive and do not expose account IDs',async()=>{
 const db=fakeDb({row:{
  gamertag:'Clan_Gamertag',platform:'psn',status:'matched',
  is_clan_member:true,pubg_account_id:'account.SHARED_KEY'
 }});
 const reply=await admin.command(db,message('status','clan_gamertag'));
 assert.match(reply,/official clan member: \*\*Yes\*\*/i);
 assert.match(reply,/PlayStation/);
 assert.deepEqual(db.calls.map(c=>c[0]),['from','select','ilike','limit']);
 assert.doesNotMatch(reply,/account\.|SHARED_KEY/);
});
test('audit response is private, bounded and has no raw member ids or tokens',async()=>{
 const db=fakeDb({history:[{
  gamertag:'@everyone_a',action:'add',outcome:'added',
  actor_discord_id:actor,previous_membership:false,
  current_membership:true,occurred_at:'2026-11-07T13:00:00Z'
 }]});
 const reply=await admin.command(db,message('audit'));
 assert.match(reply,/Last 1 clan roster admin attempt/);
 assert.match(reply,/…5678/);
 assert.doesNotMatch(reply,/<@|123456789012345678/);
 assert.match(reply,/@\u200beveryone/);
 assert.deepEqual(db.calls.slice(-1),[['limit',5]]);
});
test('duplicates, case collisions, absent members and unchanged requests are explicit',()=>{
 for(const [status,phrase] of [
  ['duplicate',/already processed/],['ambiguous',/differ only by case/],
  ['not_found',/Nothing was removed/],['unchanged',/No changes were made/]
 ])assert.match(admin.formatMutation({status,gamertag:'Player'},'add'),phrase);
});
test('migration uses only service role with append-only evidence and preserved stats',()=>{
 const sql=fs.readFileSync(path.join(__dirname,
  '../supabase/migrations/20261107_secure_discord_clan_roster_admin.sql'),'utf8');
 assert.match(sql,/create table if not exists public\.clan_membership_audit/);
 assert.match(sql,/enable row level security/);
 assert.match(sql,/security invoker/);
 assert.match(sql,/revoke all on function public\.manage_discord_clan_membership/);
 assert.match(sql,/grant execute on function public\.manage_discord_clan_membership/);
 assert.match(sql,/to service_role/);
 assert.match(sql,/pg_advisory_xact_lock/);
 assert.match(sql,/duplicate_event/);
 assert.match(sql,/outcome text not null/);
 assert.match(sql,/\x27unchanged\x27,previous,desired,existing.status/);
 assert.match(sql,/update public\.player_import_queue set is_clan_member=desired/);
 assert.doesNotMatch(sql,/delete from public\.(?:players|player_import_queue)/i);
 const router=fs.readFileSync(path.join(__dirname,'../api/index.js'),'utf8');
 assert.match(router,/clanRosterAdmin\.command\(db, body\)/);
 assert.match(router,/body\.data\?\.name === 'clanmanage'/);
 assert.match(router,/flags: 64/);
});
