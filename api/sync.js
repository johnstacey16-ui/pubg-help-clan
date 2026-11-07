'use strict';
const { createClient } = require('@supabase/supabase-js');
const { importPendingBatch } = require('../lib/import-batch');
const { collectClanSeasons } = require('../lib/clan-season-sync');
const { collectClanExtras } = require('../lib/clan-backfill');
const channelDashboard = require('../lib/channel-dashboard');
const {verifyGitHubBackfillToken}=require('../lib/github-oidc');

// Vercel Hobby's daily cron is a fallback. /leaderboard can make progress
// immediately when people use the bot; both share the database API budget.
module.exports = async (req, res) => {
  if (req.method !== 'GET')
    return res.status(405).json({ error: 'Method not allowed' });

  const secret = process.env.CRON_SECRET;
  if (!process.env.PUBG_API_KEY ||
    !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY)
    return res.status(503).json({ error: 'Import environment is not configured' });
  const mode=req.query?.mode;
  if(mode!==undefined&&mode!=='backfill')
    return res.status(400).json({error:'Unknown sync mode'});
  // Daily Vercel cron retains its existing, production-only CRON_SECRET.
  // The GitHub catch-up runner may instead present a cryptographically signed
  // short-lived workflow ID token; it is authorised ONLY for backfill mode.
  const authorization=req.headers?.authorization;
  const cronAllowed=Boolean(secret)&&authorization==='Bearer '+secret;
  const oidcAllowed=!cronAllowed&&mode==='backfill'&&
    typeof authorization==='string'&&authorization.startsWith('Bearer ')&&
    await verifyGitHubBackfillToken(authorization.slice(7));
  if(!cronAllowed&&!oidcAllowed)
    return res.status(401).json({error:'Unauthorized'});

  const db = createClient(process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

  let result;
  try {
    result = await importPendingBatch(db);
  } catch (error) {
    console.error('Scheduled console import failed:', error.message);
    result = { status: 'import_failed' };
  }

  if(mode==='backfill'){
    try{result.extras=await collectClanExtras(db);}
    catch(error){console.error('Clan extras backfill failed:',error.message);
      result.extras={status:'failed'};}
    try{result.seasonCollection=await collectClanSeasons(db);}
    catch(error){console.error('Clan season backfill failed:',error.message);
      result.seasonCollection={status:'failed'};}
    return res.status(200).json({mode:'backfill',...result});
  }

  // The daily cron also updates every configured persistent Discord dashboard
  // card in place. A failed PUBG import must not prevent saved stats from being
  // displayed; a Discord permission failure must not lose the import result.
  try {
    result.dashboard = await channelDashboard.dailyUpdate(db);
  } catch (error) {
    console.error('Scheduled Discord dashboard update failed:', error.message);
    result.dashboard = { status: 'post_failed' };
  }
  // Gradually populate genuine season/ranked results for verified clan
  // members, after keeping the existing Discord dashboards up to date.
  try {
    result.seasonCollection=await collectClanSeasons(db);
  } catch (error) {
    console.error('Scheduled clan season collection failed:',error.message);
    result.seasonCollection={status:'collection_failed'};
  }
  // Short optional queue stage: prefill profile indices, mastery and match details.
  try{result.extras=await collectClanExtras(db);}
  catch(error){console.error('Scheduled extra PUBG backfill failed:',error.message);
    result.extras={status:'failed'};}
  // Pruning occurs on the existing secret-protected daily sync.
  try {
    const pruned=await db.rpc('prune_clan_match_archive');
    result.archive=pruned.error?{status:'prune_failed'}:
      {status:'ok',removed:Number(pruned.data)||0};
    if(pruned.error)console.error('Archive prune failed:',pruned.error.message);
  }catch(error){
    console.error('Archive maintenance unavailable:',error.message);
    result.archive={status:'prune_failed'};
  }
  // Retain sanitized real match lobbies for 180 days; leave the original
  // per-player archive and temporary PUBG cache lifecycle independent.
  try {
    const trimmed=await db.rpc('prune_pubg_match_lobby_archive');
    result.matchLobbyArchive=trimmed.error?{status:'prune_failed'}:
      {status:'ok',removed:Number(trimmed.data)||0};
    if(trimmed.error)console.error('Match lobby prune failed:',trimmed.error.message);
  }catch(error){
    console.error('Match lobby archive maintenance unavailable:',error.message);
    result.matchLobbyArchive={status:'prune_failed'};
  }
  // Purge compact season/ranked observations older than 18 months.
  // Runs through the existing secret-protected daily Vercel cron.
  try {
    const trimmed=await db.rpc('prune_player_season_snapshots');
    result.seasonHistory=trimmed.error?{status:'prune_failed'}:
      {status:'ok',removed:Number(trimmed.data)||0};
    if(trimmed.error)console.error('Season-history prune failed:',trimmed.error.message);
  }catch(error){
    console.error('Season-history maintenance unavailable:',error.message);
    result.seasonHistory={status:'prune_failed'};
  }
  const failed = result.status === 'import_failed' &&
    result.dashboard.status === 'post_failed';
  return res.status(failed ? 502 : 200).json(result);
};
