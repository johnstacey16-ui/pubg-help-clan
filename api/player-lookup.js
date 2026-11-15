'use strict';
const {createClient}=require('@supabase/supabase-js');
const {getStats}=require('../lib/live-stats');
const {publicPlayer,validInput,REFRESH_FRESH_MS}=require('../lib/web-player');
// Require an exact same-origin HTTPS request from a configured public website.
// Do not accept arbitrary *.vercel.app preview deployments or spoofed hosts.
const WEBSITE_HOSTS=new Set([
 'pubg-help-clan.vercel.app',
 'pubg-clan-bot.vercel.app', // Legacy bookmarked URL
 'pubg-help-clan-acme-a675.vercel.app',
 'pubg-help-clan-git-main-acme-a675.vercel.app'
]);
const sameOrigin=req=>{
 const host=String(req.headers?.host||'').toLowerCase();
 const origin=String(req.headers?.origin||'').toLowerCase();
 return WEBSITE_HOSTS.has(host) && origin==='https://'+host;
};
async function processLookup(db,{name,platform='auto',refresh=false}){
 if(!validInput(name,platform))
   return{status:400,body:{error:'Enter one valid gamertag (Auto-detect, Xbox or PlayStation)'}};
 const saved=await publicPlayer(db,name,platform);
 if(saved.status!==200||!refresh)return saved;
 const stamp=saved.body.player?.updatedAt;
 if(stamp && Number.isFinite(Date.parse(stamp))&&
   Date.now()-Date.parse(stamp)<REFRESH_FRESH_MS)
   return{status:200,body:{...saved.body,refreshState:'recent',
     note:'These PUBG statistics were updated within the last 2 minutes.'}};
 // Once saved, use the confirmed console in both refresh cooldown and PUBG calls.
 // Unknown names use auto once, checking Xbox and PSN within the shared API budget.
 const resolvedPlatform=saved.body.found?saved.body.platform:platform;
 const slot=await db.rpc('reserve_web_refresh',{p_player_key:resolvedPlatform+':'+name.toLowerCase()});
 if(slot.error)throw new Error('Web refresh budget unavailable');
 if(!slot.data)return{status:429,body:{error:'Website PUBG refresh capacity is cooling down. Saved statistics remain available.',retryAfterSeconds:90}};
 const result=await getStats(db,name,{platform:resolvedPlatform==='auto'?null:resolvedPlatform,refreshRequested:true});
 if(result.state==='platform_conflict')
   return{status:409,body:{error:result.message}};
 if(result.state==='invalid')return{status:400,body:{error:result.message}};
 if(result.state==='ambiguous')
   return{status:409,body:{
     error:'This gamertag was found on both Xbox and PlayStation. Choose the console for the player you want to view.',
     code:'platform_ambiguous',choices:['xbox','psn']
   }};
 if(result.state==='queued')return{status:429,body:{error:'PUBG API budget is busy. Please try again later.',retryAfterSeconds:90}};
 if(result.state==='not_found')return{status:404,body:{error:resolvedPlatform==='auto'?'No exact PUBG account found on Xbox or PlayStation.':'No matching PUBG account on this console.'}};
 if(result.state==='unavailable')return{status:503,body:{error:'PUBG data is temporarily unavailable.'}};
 const updated=await publicPlayer(db,name,resolvedPlatform);
 if(updated.status!==200)return updated;
 return{status:200,body:{...updated.body,
   refreshState:result.source==='live'?'refreshed':result.source||result.state,
   note:result.source==='live'?'Updated from PUBG and saved to Supabase.':
     result.message||'Showing the latest saved PUBG statistics.'}};
}
module.exports=async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Cache-Control','no-store');
 if(!['GET','POST'].includes(req.method))
   return res.status(405).json({error:'Method not allowed'});
 if(req.method==='POST'&&!sameOrigin(req))
   return res.status(403).json({error:'Website refresh requests must come from the same origin'});
 if(req.method==='POST'&&Number(req.headers['content-length']||0)>4096)
   return res.status(413).json({error:'Request too large'});
 let body=req.method==='GET'?req.query:req.body;
 if(req.method==='POST'&&typeof body==='string'){
   try{body=JSON.parse(body)}catch(e){return res.status(400).json({error:'Invalid JSON'})}
 }
 if(!body||typeof body!=='object'||!validInput(body.name,body.platform??'auto'))
   return res.status(400).json({error:'Choose a valid player name and console'});
 if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SERVICE_KEY)
   return res.status(503).json({error:'Data source is not configured'});
 try{
   const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_KEY,{
     auth:{autoRefreshToken:false,persistSession:false}
   });
   const out=await processLookup(db,{name:body.name,platform:body.platform??'auto',refresh:req.method==='POST'});
   if(out.status===429)res.setHeader('Retry-After','90');
   return res.status(out.status).json(out.body);
 }catch(error){
   console.error('Web player lookup failed:',error.message);
   return res.status(503).json({error:'PUBG lookup temporarily unavailable'});
 }
};
module.exports.processLookup=processLookup;
module.exports.sameOrigin=sameOrigin;
