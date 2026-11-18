'use strict';
const { createClient } = require('@supabase/supabase-js');
const { shapeWebStats } = require('../lib/web-stats');

// Public read-only view. This function NEVER fetches from PUBG, writes to
// Supabase, or exposes arbitrary players, email, account IDs or credentials.
module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Access-Control-Allow-Origin', 'https://pubg-help-clan.vercel.app');
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY)
    return res.status(503).json({ error: 'Data source not configured' });
  try {
    const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const [roster, players, details] = await Promise.all([
      db.from('player_import_queue')
        .select('gamertag,is_clan_member,status,platform,pubg_account_id')
        .eq('is_clan_member', true).limit(1000),
      db.from('players')
        .select('id,gamertag,platform,pubg_account_id,total_kills,total_wins,matches_played,last_checked')
        .in('platform', ['xbox', 'psn']).limit(1000),
      db.from('player_lifetime_details')
        .select('player_id,game_mode_stats').limit(1000)
    ]);
    if (roster.error || players.error || details.error) throw new Error('Database read failed');
    const data = shapeWebStats({
      roster: roster.data || [],
      players: players.data || [],
      details: details.data || []
    });
    return res.status(200).json(data);
  } catch (error) {
    console.error('Web dashboard snapshot error:', error.message);
    return res.status(503).json({ error: 'Saved PUBG statistics temporarily unavailable' });
  }
};
