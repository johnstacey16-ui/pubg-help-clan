# PUBG Console Clan Discord Bot

**Developer rules:** [AGENTS.md](AGENTS.md) defines modular source organization, the new-code 300-line readability target, reuse-first changes, trusted-side validation, rate-budget preservation, and release/testing boundaries. These rules apply to the bot, dashboard and training toolkit without requiring a bulk rewrite.

## Consolidated project ownership (November 2026)

**This repository is the canonical HELP Clan application.** The full static training
toolkit, PUBG clan website, verified match archive, and Discord bot are all maintained
here. The October 2026 HELP Toolkit source snapshot is already copied into
`training/` (265 of the old source's 266 files; the sole omitted file is its old
GitHub Actions workflow). The remaining three adapted files are integrated site UI
and browser-test files; the other 262 copies are identical to the original.
No runtime, build, or CI step should clone the old toolkit repository.
Use changes to `training/` here for all further training-tool development.

The older **PUBG-Console-Dashboard** was a separate on-demand
PUBG API/Upstash Redis application, not this application's Supabase/Discord
backend. It contains legacy raw-data exports and 2D replay source that
were not carried forward verbatim. Its repo and optional old Upstash cache
must be assessed separately before permanent deletion. Do not delete the
active **PUBG Bot** Supabase project or any deployment serving the Discord
interactions endpoint and clan website.


A Vercel serverless Discord bot using **PUBG API**, **Supabase**, and optional **Groq** AI commentary. It supports **Xbox and PlayStation only** (no PC). Match/season/mastery features are subject to actual PUBG API availability.

## Web dashboard (initial build)

The website and Discord bot now share **this repository, Vercel project, and Supabase**.

- Main HELP Clan toolkit: https://pubg-help-clan.vercel.app/
- Clan dashboard (first toolkit navigation item): https://pubg-help-clan.vercel.app/dashboard/
- The toolkit is the homepage and links to the separately loaded, visually unified dashboard at `/dashboard/`. Discord dashboard buttons point to `/dashboard/`; Discord's signed Interactions Endpoint remains `https://pubg-help-clan.vercel.app/interactions`. Old root `/#player/...` deep links are forwarded to `/dashboard/#player/...`.
- Read-only web API: `GET /api/public-stats`
- Existing Discord webhook: `POST /interactions` (unchanged)
- Existing scheduled sync: `GET /api/sync` (unchanged)
- Existing status route: `GET /api/health` (unchanged)

The website includes a mobile-friendly dark overview, official-clan lifetime leaderboards, paginated and sortable roster with favourites saved on each device, per-mode charts, verified profiles, comparisons and real history. Public Xbox/PlayStation player searches and explicit website PUBG refreshes now run through Vercel functions with an atomic Supabase cooldown and shared PUBG API rate limit. Ordinary reloads read saved data without spending PUBG API capacity. Favourites use browser storage only; they are not shared across devices.

This deployment uses Vercel's existing `builds` configuration plus explicit `@vercel/static` entries for `index.html`, `assets/**` and `design/**`. Preserve those static builds when modifying `vercel.json`. Secret environment variables are never supplied to browser code.

- [Project roadmap with status checkboxes](./ROADMAP.md)
- [Original overview picture](./design/overview-reference.svg)
- [Original leaderboard picture](./design/leaderboard-reference.svg)

The two SVGs are original editable design references. Their illustrated numbers are **not actual PUBG results**; the website itself requests verified data from Supabase.

### Commands

## Commands (21)

| Discord command | What it does |
|---|---|
| /stats gamertag | Fetch a verified console player, cache lifetime stats for two hours, display Groq commentary |
| /setup | Admin: save the channel where you run it and create eight permanent dashboard cards |
| /dashboard setup, refresh, status | Advanced dashboard setup, status and manual refresh |
| /leaderboard | Rank **official roster** players by saved lifetime kills and progressively import pending names |
| /roster [page] | View the 55 supplied clan names and import progress |
| /clan | Official clan totals and verified member counts |
| /compare player1 player2 | Compare two Xbox/PSN players using actual saved PUBG statistics |
| /modes gamertag [mode] | Detailed Solo/Duo/Squad lifetime statistics, including FPP modes |
| /recent gamertag [count] | Player's recent match IDs, placements, kills, damage and maps |
| /form gamertag | Two saved 10-game windows, metric changes and honest source coverage |
| /rivals gamertag [days] | Verified direct-kill rivalries from saved combat reports (no API calls) |
| /clanmatches [days] | Read-only archived clan results for the last 7, 30 or 180 days |
| /intel [section] | Open detailed website views including opponent scouting, match history and awards |
| /match gamertag matchid | Individual match result, player kills, placement, assists and more |
| /squad gamertag matchid | Squad breakdown for one match: teammates, kills, damage, assists and knocks |
| /teammates gamertag [count] | Most frequent teammates in the last 1–5 available matches |
| /mastery gamertag type | Weapon or survival mastery, if PUBG returns it |
| /season gamertag | Current-season game modes and results |
| /ranked gamertag | Current ranked tier, rank points and game results, where available |
| /help | Help and list of commands |

**How new commands appear:** After this release is deployed, run an already-registered /stats or /leaderboard command once in the clan Discord guild. The bot verifies the signed Discord interaction, then uses its existing secret Vercel DISCORD_BOT_TOKEN to register the full command list. Refresh Discord's slash-command menu if needed. Registration success appears at /api/health under discord_commands.registered. The local registration script also uses the exact same command definitions; it does a bulk overwrite. **If `/setup` is not visible immediately after a deploy, run `/stats` or `/leaderboard` once so the bot re-registers commands, then reopen the slash-command picker.**

## Official clan vs tracked players

The original 55 supplied names are marked as official clan members in player_import_queue.is_clan_member. Any new user-searched account is tracked and cached, but **not silently promoted to clan membership**. /leaderboard and /clan include only official clan members. /stats, /compare and other player commands work with both groups. Bulk imports focus on official clan names.

## PUBG data and caching

- The standard developer API limit is 10 requests/minute; an atomic Supabase RPC reserves at most 8 calls in 65 seconds across ALL functions, with headroom.
- Account identity search checks Xbox and PSN separately, in batches of up to 10 names.
- The next import step downloads lifetime mode stats for identified account IDs; failed attempts remain queued rather than creating invented zeros.
- /stats checks Supabase first and refreshes when older than two hours.
- A new pubg_endpoint_cache stores player recent-match indexes (15 minutes), season IDs (30 days), mastery (3 hours), season/ranked stats (2 hours), and full match objects (24 hours). Stale data can be shown during API outages with a clear status.
- PUBG match objects are fetched through the **console** shard, are not rate-limited, and are normally available only for 14 days.
- Groq writes optional commentary; the underlying PUBG numeric data always remains the authority.
- /api/sync is an authenticated daily Vercel Hobby fallback (05:00 UTC). It shares the same import queue and rate limit. CRON_SECRET is required.

## Configuration and security

Production Vercel environment variables: DISCORD_PUBLIC_KEY, DISCORD_CLIENT_ID, DISCORD_BOT_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_KEY, PUBG_API_KEY, CRON_SECRET, optionally GROQ_API_KEY. Never print, paste into chat, or commit secret values. Set Discord Interactions Endpoint URL to https://pubg-help-clan.vercel.app/interactions. The bot validates Ed25519 signatures over the raw Discord request body before processing or registering commands. The backend acknowledges slash commands immediately and edits the deferred reply after fetching data.

Important: the legacy public.players, public.matches and public.clan_records Supabase tables **still have RLS disabled**. Restrict their access using deliberate grants/RLS policies before treating the system as fully secured; avoid enabling RLS blindly without reviewing client access.

## Controlled Vercel releases (10 November 2026)

**PUBG now follows the same deliberate deployment gate as Crown & Kingdoms.**
Normal pushes to `main` (features, tests, docs, refactors) still run GitHub Actions, but Vercel's `ignoreCommand` runs `node scripts/vercel-deployment-gate.mjs` and **skips the build unless the Git commit message contains a standalone `[deploy]` marker**. Exit code 0 skips, exit code 1 allows a build. The ignored step does not prevent Vercel from *creating* a canceled/skipped deployment record; do not count these as published releases or assume they are free of deployment quota accounting.

To intentionally publish an accepted version: review `main`, confirm `npm test`, `npm run check`, GitHub Actions and browser results, then make **one deliberate release commit** with `[deploy]` in the message (for example `release: verified clan update [deploy]`). Verify Vercel's production build is READY and the production alias serves that commit; check `/api/health`, static toolkit/dashboard routes, and the signed Discord interactions endpoint without leaking secrets. The existing daily `/api/sync` cron and all API routes remain unchanged. Do **not** include `[deploy]` in routine commit messages, including the commit adding this policy.

This gate applies to **Git-triggered Vercel builds**; manual CLI deployments, dashboard redeploys with the Ignore Build Step disabled, and other authorized promotion routes can still publish independently. The old production website keeps running when a new build is skipped. GitHub's existing production-HTTP smoke job checks the currently live website, **not proof** that the newest code was deployed. The gate does not run the test suite itself, so tests and explicit release verification remain mandatory.

## Validation and roadmap

Run npm test and npm run check. Verify deployments and /api/health, then exercise commands inside Discord.

This is the *first comprehensive command pack*, not yet every possible PUBG API value. Planned additions: verified clan membership editing, richer mastery formatting, full per-weapon records, telemetry analytics (damage timeline, opponents, kills, revives, paths), match and telemetry-based analysis, official PUBG season leaderboard, multi-metric clan rankings, detailed match history storage, and robust free-tier cache retention. PUBG telemetry and match data are only available while the upstream source retains them.

## Phase 2 — Shareable verified player profiles and real history

Any saved Xbox/PlayStation player can have a shareable platform-aware hash link, such as
`https://pubg-help-clan.vercel.app/#player/DrBeryl762`.
The site opens the profile on any browser without logging into Discord. The
player profile shows available lifetime mode details, a copyable link and a
metric selector for **kills, wins and matches over time**.

**History is genuine, not backfilled fiction.** The private
`public.player_stat_snapshots` table is seeded only with each player's
actual most recent saved PUBG lookup; a PostgreSQL trigger captures future bot
and importer updates once per UTC day. The chart displays a line only when two
or more real observations exist. A single point is labelled as a baseline,
not a fabricated trend.

`GET /api/player-history?name=<gamertag>` resolves exact verified
official-clan membership before querying the private snapshot table. The
service-role key stays exclusively in Vercel. The anonymous client only sees
allowlisted timestamps and numeric totals — no internal player IDs, account
IDs or tracked outsiders. The snapshot table has RLS enabled, no
`anon`/`authenticated` privileges and an explicit service-role grant, as
required by the Supabase October 2026 table exposure changes.

## Discord intelligence parity (November 2026)

The existing bot now offers the read-only, cache-only commands
\`/form gamertag\`, \`/rivals gamertag [days]\` and
\`/clanmatches [days]\`. They reuse the website's validated stored
match reports, direct-kill telemetry summaries and verified-clan history
aggregation. None of these commands performs a fresh PUBG lookup, triggers
match ingestion or spends the shared PUBG API budget. No new Vercel function
or database migration is required.

\`/form\` compares the ten newest dated saved games with the preceding ten;
incomplete data is reported as missing, never as zero. \`/rivals\` includes only
previously analysed direct kills/deaths and warns that visible opponent names
do not prove account identities across different games. \`/clanmatches\`
summarises observed archive matches, not lifetime stats. For longer tables
and drilling into saved lobby opponents use \`/intel section:scout\` or
the new **Match intel & scouting** link on the permanent Discord cards.
Individual \`/form\` and \`/rivals\` responses link directly to
that saved player's analysis panel via an encoded dashboard hash.
The dashboard uses only saved account lookups; a link never triggers a PUBG refresh.
\`/recent\` continues to serve short, recent PUBG lookups (subject to the
existing budget) while rendering friendly battleground names.

**Registration:** The command manifest version has changed; after deploying
to production the next authenticated signed clan Discord interaction attempts
to register the new guild slash commands using the existing private bot token.
A successful website deployment by itself does not verify Discord's command menu.
The permanent dashboard cards refresh through the existing daily scheduler or
the existing manual dashboard refresh/setup buttons.

## Dedicated Discord dashboard channel

1. Create a text channel in the clan Discord server (for example `#clan-stats`). Make it read-only for members if you want only the bot to post there. Ensure the bot has View Channel, Send Messages, and Embed Links permissions. Optional Pin Messages permission lets it pin each card automatically.
2. As a member with Manage Channels or Administrator permission, run **`/setup`** (or `/dashboard setup`) **inside that channel**. The bot creates eight permanent cards: **overview, lifetime leaderboard, six game-mode totals, roster/import progress, and saved records/recent updates, and three full member-stat pages**. Message IDs and the channel are recorded in Supabase; running setup again edits existing messages instead of flooding the channel.
3. Any member can tap **Refresh dashboards** on a card. The bot checks for pending roster imports and up to two stale players, uses the existing atomic PUBG API budget, saves any available changes in Supabase, then edits the original eight posts. A global 90-second click cooldown and database lock prevent duplicate requests. The user gets a private confirmation instead of a new public chat message.
4. `/dashboard status` (channel managers) reports the configured location and last refresh. `/dashboard refresh` also triggers a refresh without using a button. **Each day, the existing Vercel Hobby cron also edits the saved dashboard cards automatically after the scheduled import at approximately 05:00 UTC (Vercel may execute at any time within that hour).** It does not send eight new messages every day.

Dashboard cards show **saved Supabase data immediately**, without wasting API calls every time someone opens Discord. Detailed player, match, and weapon reports remain available from the other slash commands. New account identities continue to be imported in batches within rate limits. This is a message dashboard (Discord embeds), not an arbitrary interactive website embedded in a Discord message.

If dashboard setup fails, verify that the bot is installed in the server and can send embeds in the chosen channel. Dashboard data is not publicly exposed through Supabase; only the signed Discord bot backend uses its service key.

### Modern Discord Components V2 layout

The permanent dashboard messages use **Discord Components V2** rather than old plain embeds. Coloured containers, grouped typography, separators, ranking sections, roster-completion bars and the same Refresh button make the cards easier to scan on desktop and mobile. Existing eight dashboard message IDs are edited in place on the next /dashboard setup, /dashboard refresh or Refresh button (without creating new posts). The migration explicitly clears old content and embeds while setting the immutable IS_COMPONENTS_V2 flag (32768). A real dashboard web app or Discord Activity would be necessary for fully custom interactive charts; this channel layout does not embed HTML/CSS.


## Phase 3 — Cached match intelligence and telemetry replay

The website's **Match Intelligence** tab reads detailed match data **only from
already-saved Supabase cache entries**. It does not make public PUBG API calls,
does not reserve PUBG request budget, and never returns telemetry URLs or
internal PUBG account IDs.

- Select a verified clan player, or choose **View saved match analysis** from
  that player's profile.
- Review map, mode, placement, kills, damage, assists, headshots, knockdowns,
  revives, heals and the squad's reported performance.
- Use the Discord \`/recent gamertag\` command to fetch available recent matches
  within the shared rate limit; reload the web tab afterwards.
- Match data exists for about 14 days in PUBG; this first public viewer
  exposes at most eight indexed and previously cached detailed matches.
- Public endpoint: \`GET /api/public-matches?name=...\` checks exact verified
  official-clan membership before reading cache and returns only safe fields.
- No match history or opponents are fabricated when the cache is empty.

The long-term archive, additional match collection and protected site refresh
remain roadmap tasks.


## Advanced lifetime profiles and comparisons

The existing /api/public-stats response includes allowlisted advanced metrics from the official PUBG lifetime game modes: damage, headshot kills, assists, knockdowns, revives, Top 10 finishes, heals, boosts and longest kill. Additive values are summed over Solo/Duo/Squad TPP/FPP modes. Longest kill is the maximum across modes. Missing fields display a dash, not a fabricated zero.

Leaderboards can rank by advanced metrics and player comparisons can select a specific TPP/FPP mode. These are Supabase-cache reads and do not make additional PUBG requests.


## Persistent PUBG match archive

The private Supabase `clan_match_archive` table stores sanitised summaries for saved Xbox and PlayStation accounts, populated automatically when the existing bot caches a PUBG match response. It contains no raw PUBG JSON, account IDs or telemetry URLs. Three previously cached genuine match reports were backfilled without new PUBG requests.

Retention is **180 days from the match date**. The existing secret-protected Vercel cron calls `prune_clan_match_archive` during its daily run. If a scheduled run fails, the next successful run resumes pruning. The archive uses RLS and service-role-only grants.

The website's `GET /api/public-matches?name=...` now prioritises up to 30 archived match summaries for a verified clan member. If the archive is empty, it falls back to the temporary PUBG cache. The backend checks roster membership before reading the archive and allowlists every field returned to public viewers.


## Weapon mastery and teammate intelligence

The website now includes **Weapon Mastery** and **Teammate Insights**, using
the read-only, cache-only `GET /api/public-insights?kind=weapons|teammates&name=<gamertag>`
endpoint. Both views verify exact official-clan membership before reading
any Supabase data. Neither requires additional upstream PUBG API requests.

The weapon response is mapped from
`data.attributes.weaponSummaries`, including
`StatsTotal`, `OfficialStatsTotal` and
`CompetitiveStatsTotal` as distinct categories. PUBG keys
`Kills`, `HeadShots`,
`DamagePlayer`, `Groggies`,
`LevelCurrent`, `TierCurrent` and
`XPTotal` are mapped directly; missing fields display an
unavailable dash instead of a false zero. Only one player's mastery
response is currently cached; use the bot's `/mastery`
command to populate additional players without bypassing the rate budget.

Teammate statistics group previously archived squad members by name, counting
games played together, wins together, the partner's kills, damage, assists
and knockdowns, and most recent archived match. The summary reflects
**archived games only**, not guaranteed full PUBG career coverage, and
does not imply that opponents are identified as rivals.


### Expanded saved-player access

All saved Xbox and PlayStation accounts, including people outside the official clan, can use the individual history, match, weapon and teammate views. The 180-day match archive trigger now accepts every saved console player instead of checking clan membership. Official clan totals are deliberately calculated only from the 55-name roster. The private `web_refresh_guard` table and RPC are versioned in `supabase/migrations/` and never accessible to browser-side Supabase credentials.


## Search any console player and refresh from PUBG

The home page now searches **any Xbox or PlayStation PUBG account**:
`GET /api/player-lookup?name=...&platform=xbox|psn` reads saved
statistics and `POST /api/player-lookup` accepts
`{"name":"gamertag","platform":"xbox"}` to refresh
lifetime stats from PUBG. The POST is same-origin and server-side only.
It never exposes the PUBG or Supabase service-role API keys.

The service-role-only Supabase `reserve_web_refresh` RPC
throttles public web refreshes globally (90 seconds) and per player (15
minutes). The Discord bot, importer and website also share the existing
atomic `reserve_pubg_requests` PUBG budget.
The website uses cached stats if they were refreshed in the last 15
minutes. Newly searched accounts are saved with
`is_clan_member=false` by default.

Website player profiles, weapon mastery, history, teammate and match
views now accept all saved Xbox/PSN accounts. Official clan totals
and rankings remain separate. The private match archive can also
store summarised games for any saved player.

**Console discovery:** Auto-detect is the default. For a previously unseen
gamertag, the server searches Xbox and PlayStation, records the one
confirmed account (platform + PUBG account ID), and uses that saved
identity for later updates. Searches of already-saved names need no
additional platform lookup. If the same gamertag resolves to distinct
accounts on both shards, the site asks which console is intended rather
than guessing. The legacy schema intentionally stores one account per
gamertag; it never silently overwrites another console's saved identity.
Supporting unrelated accounts with identical names is only worth a
database migration if users actually need it.

**Scope clarification (2026-11-03):** A player's membership in the 55-name official clan is not required for individual profile, history, match, weapon or teammate reads. The only clan-only figures are the official clan overview, roster, mode totals and clan leaderboard. Lifetime PUBG refreshes can be requested through the website with the shared server-side budget.


### Console detection update

Auto-detect is selected by default in the web search panel. Once an Xbox or PlayStation account has been confirmed, the selector changes to that console and later refreshes reuse the stored account ID. A previously shared player link without a platform also resolves saved data automatically. A duplicate name across genuinely different console identities triggers a choice rather than adding duplicate records.


## Website refresh: weapon mastery, recent matches and seasons

Website visitors can refresh the selected saved console player's **weapon mastery,
recent match index, current season, or ranked season** from the relevant page.
They must first use the homepage to find and save the real Xbox/PSN account;
subsequent refreshes reuse that confirmed platform and account ID. The website
never searches both consoles again for known players.

- `POST /api/player-refresh` (same-origin, JSON body
  `{"name":"<gamertag>","platform":"auto|xbox|psn","scope":"weapons|matches|season|ranked"}`)
  requires a saved account, reserves the global web refresh cooldown and
  a **per-player, per-scope 15-minute cooldown** through Supabase.
- The same existing `reserve_pubg_requests` database RPC remains
  the authority for PUBG's shared rate limit across the website and Discord.
  No browser receives `PUBG_API_KEY` or Supabase credentials.
- Weapon refresh calls the genuine console `weapon_mastery`
  endpoint. Recent matches refresh the saved player match index (one
  rate-limited call) and fetch up to five unique, valid console match
  reports, which PUBG does not charge against the normal API limit.
  Supabase's existing archive trigger saves compact reports.
- Current season and ranked each refresh the platform's current season list
  and that player's season/ranked statistics. Both are bounded to two
  rate-limited API requests per refresh; a season change can be detected
  even if the previous season list had a 30-day cache TTL.
- `GET /api/public-season?name=...&type=season|ranked` reads
  and allowlists already saved mode stats. It never fetches PUBG and never
  returns account IDs, raw cache entries, credentials or telemetry.

The **Reload saved** buttons never contact PUBG. The separate **Refresh
from PUBG** buttons are explicit, rate limited, and preserve stored data if
PUBG returns a temporary error. This is the current season viewer, not a
fabricated historical season graph; longitudinal season history remains
future work.


## Real season and ranked progression (2026-11-03)

The private Supabase `player_season_snapshots` table stores one
**genuine PUBG observation per player, season, mode, type and hour**.
Entries retain only observed match counts, kills, wins, damage, rank
points, the current tier/subtier and the original `fetched_at`
timestamp. No raw PUBG response, account ID, telemetry or credentials
are copied into this historical table. The `archive_pubg_season_cache`
database trigger captures future updates from **both Discord and the
website** without extra upstream PUBG calls. The first migration backfilled
six mode-level rows from one genuine previously cached ranked response;
it did **not** invent historical data for other days or seasons.

Data is retained for **18 months**, with hourly deduplication and the
existing secret-protected daily sync calling
`prune_player_season_snapshots`. RLS blocks anonymous and
authenticated database access; only the server-side service role reads it.
The public `GET /api/public-season` returns at most 240
sanitised season/mode observations for an individual saved player and
statistic type, alongside current season stats and a list of archived season
IDs. All private player IDs and PUBG account identifiers are excluded.

On the Season & Ranked page, visitors can select an archived season and
a game mode to inspect **real kills or ranked RP progression**. A single
observation shows an honest baseline and an explanation; only two or more
actual captured observations produce a line chart. Historic seasons remain
available in the compact archive even after the current-season cache
changes. No estimates or synthetic pre-refresh history are drawn.


## Historical season and ranked clan leaderboards (2026-11-03)

The Season & Ranked page now has a cross-player official-clan leaderboard.
Select saved season, Solo/Duo/Squad TPP/FPP, season or ranked, and the actual
metric to sort. Values come **only** from the latest saved observation per
verified clan member in the selected season and mode. Each player has an
independent observation timestamp: ranks are not simultaneous, and missing
stats are excluded rather than being treated as zero.

The read-only endpoint is \`GET /api/public-season-leaderboard?type=ranked&mode=squad\`.
It calls the service-role-only \`get_clan_season_leaderboard\` Supabase RPC;
the browser never calls Supabase directly and no PUBG requests occur when
reading or sorting leaderboards. The migration is retained in
\`supabase/migrations/20261103_verified_clan_season_ranked_leaderboard.sql\`.
Players outside the official clan never enter this leaderboard, while their
individual season reports remain accessible separately.


## Gradual clan season and ranked data coverage

The existing protected daily sync now claims up to two verified clan members
for current-season and ranked collection, after the usual Discord dashboard
update. It validates their already-saved Xbox/PlayStation identity and
atomically rotates candidates through the private Supabase table
clan_season_sync_state. Each candidate is held from re-claim for 23 hours.

PUBG season indexes are revalidated once per shard per scheduled invocation;
player data uses the shared atomic reserve_pubg_requests rate limiter.
At most six upstream counted requests are attempted (two console indexes
and four player requests). Only fresh successful PUBG responses become
new season/ranked snapshots; cache fallbacks do not masquerade as new data.
If the shared API limit is busy, the batch stops rather than bypassing it.
No additional Vercel cron, paid service or public credentials are involved.

Collection progress is also exposed safely in the public /api/health response under season_collection, showing how many clan players have been attempted and the most recent result and completion time. No account IDs or player identities are included.


## Clan Command Centre analytics integration

Four new tabs — Clan Awards, Deep Analysis, Data Tools and Analytics Guide
— plus a radar chart in Compare Players adapt the reusable ideas from the
older user-owned React command centre into this lightweight website.
The old historical fixture players, third-party bot labels, bans, Recharts
and browser-specific window.storage dependencies were not copied.

Awards come exclusively from genuine saved PUBG lifetime statistics of
verified official clan members, with a minimum-match gate. Exploratory
Fragger, Support, Survivor and Hybrid roles require real cohort evidence.
The optional 0–100 clan performance model uses a weighted percentile of
actual kills/match, damage/match, win rate, assists/match, revives/match
and Top 10 rate. Five eligible peers and four measured axes are required.
A sample-size band is descriptive, not a statistical confidence interval.

The read-only GET /api/public-progress uses the private service-role RPC
get_clan_weekly_progress. It compares genuine lifetime observations with
another genuine point 6–14 days before the most recent point. Missing
comparison points remain missing; counter resets are review flags rather
than fabricated negative performance. No new PUBG requests are made.

CSV exports use saved official values. CSV imports are completely browser
local, limited to 256 KB and 200 rows with duplicate-player, field and
number validation. There is deliberately no server-side unauthenticated
import. A persistent import is deferred until manager authentication and
source auditability are implemented. External source-supplied bot exposure
is labelled unverified and only appears in the local CSV scatter plot.
It never influences the official roster, scores or awards.

What-if controls update only the page's displayed model. They do not
change Supabase records, Discord state or the PUBG API budget. A
multi-snapshot consistency award will only be introduced once sufficient
separate genuine observations exist.


## Salvaged PUBG source explorer and official game dictionaries (2026-11-03)

The PUBG Data Library at /#sources explores actual saved player, season, ranked, weapon, survival and match responses without another PUBG request. Its read-only /api/public-source endpoint uses verified saved console identities, strips account IDs/asset URLs/private keys, caps response size, checks match participation, and returns the original fetch timestamp. Searchable nested field paths preserve zero, null, false, empty objects and arrays, with an export of sanitized JSON.

Seven pinned KRAFTON publisher dictionaries from pubg/api-assets are included and attributed under design/pubg-dictionary-provenance.md. They are static, may become outdated as PUBG changes and add zero upstream requests.


## Telemetry and 2D replay migrated from older dashboard

Match Intelligence now includes bounded match-local combat summaries, verified
kill/death encounters with individual opponents, observed damage and weapon
causes, a capped player-event activity list, and a scrub-able 2D coordinate
replay with circle states, player selection, map pan/zoom and playback.

The server checks an existing saved Xbox/PlayStation player and verifies
their exact account ID is a participant of the selected saved match before
reading a telemetry asset. Only HTTPS URLs on the exact PUBG
telemetry-cdn.pubg.com host are fetched; redirects and user-supplied URLs
are refused. Payloads are size/event-bounded and transformed into player-
and match-specific derived reports with account IDs omitted. Derived data
is cached for 24 hours in the existing private Supabase endpoint cache.
Fresh queries acquire the existing 90-second atomic web cooldown. There
is no second Redis gate, no client PUBG API key, and no paid service.

PUBG telemetry itself is outside the normal rate-limited player-statistics
budget, but downloads use bandwidth; the cache and global web cooldown
bound repeated work. Replays show recorded positions only, with gaps and
stale markers visible. Terrain artwork is intentionally omitted until
the coordinates and artwork version can be shown to align correctly.
Matches without saved details or official telemetry show a clear error.


## Official regional console leaderboards

The Official Regional Ranks page supports real publisher response rankings
for Xbox/PlayStation, allowed regions, all six standard console modes, the
stored current season or an explicitly entered season ID. Results include
only publisher-returned exact ranks and available stats, with missing
cut lines left missing (not inferred). The API returns a maximum of 500
public-safe player records, no PUBG account IDs or database identifiers.

The new GET /api/public-global-leaderboard uses our existing Supabase cache,
2-hour fresh TTL, the atomic reserve_web_refresh public cooldown before
a cache miss, and the same reserve_pubg_requests PUBG API request gate
as Discord. No separate Redis/Upstash cache is deployed. Existing cached
entries do not cost upstream capacity, and stale records are labelled.
This is **not** a clan leaderboard. Publisher availability depends on
the selected region, season and mode.


### Vercel Hobby function limit

The old project had already reached the Hobby limit of **12 Node serverless functions**. To preserve free hosting, the new public-safe source and official regional ranking URLs are aliases for the existing insights function, and the telemetry analysis URL is an alias for the existing match function. Their frontend queries include explicit route selectors. The three new handler files were removed; all heavy logic is in reusable lib modules. This prevents the Vercel exceeded_serverless_functions_per_deployment build error. The regression suite explicitly checks the function count and aliases.


## Source-indexed event exploration and observed opponent trends

The replay panel now offers filtered, paginated player-event activity with
true PUBG source indexes, clickable jump-to-event playback controls, and
downloadable **sanitized** activity JSON. Positions are shown as genuine
sampled tracks and omitted from the high-volume activity event table.
A saved activity result includes source totals and the number of event rows
retained (maximum 1,200); capped results are explicitly labelled and
never presented as complete telemetry.

The cached rival-trends view uses only distinct previously analysed match
reports belonging to the exact saved console account (maximum 100 reports
read, 80 visible opponent names). It makes no upstream PUBG/telemetry
request or rate-budget reservation. The visible opponent name is used
across matches without asserting that matching names prove the same account.
It reports observed matches only; no career-wide aggregates are invented.


## PUBG Survival Mastery — saved data and shared-budget refresh

The new Survival Mastery page reads the already saved console-player
Survival Mastery response and shows only original XP, tier, level and
totalMatchesPlayed, with missing values shown as unavailable. These are
account-wide values, not normal season/ranked statistics. The selected
gamertag can be any previously saved Xbox or PlayStation account, not
necessarily an official clan member.

The explicit Refresh Survival from PUBG button uses the existing
same-origin POST player refresh endpoint and the same per-player,
per-scope website cooldown, atomic Supabase PUBG request budget,
Vercel deployment, and Supabase cache as all other player refreshes.
The new page and data reader add **zero serverless functions**.
The original safe saved response can also be inspected in the data library.


## Data Health and shared PUBG API budget

The read-only Data Health tab at /#health uses the existing /api/health endpoint. It shows real cached response counts by category, fresh/expired totals, latest saved fetch, genuine lifetime/season historical coverage, daily collection attempts and shared request reservations. It does not poll or call PUBG. The actual Supabase atomic reservation policy is 8 requests per rolling 65 seconds, below PUBG's nominal 10/minute. A reservation is not proof of a successful API response. The versioned service-role-only RPC get_public_pubg_cache_health returns no cache keys, player IDs, payloads, credentials, telemetry URLs or individual request logs. Ordinary clients cannot execute it. Missing RPC results degrade only the cache diagnostics, not the main health page.


## Headless Chromium smoke coverage

GitHub Actions now runs a separate real Google Chrome smoke job with pinned Playwright Core using the preinstalled Ubuntu 24.04 Chrome. It exercises all 18 tabs, roster pagination, awards, dictionary, Survival Mastery and Data Health at desktop (1280px) and mobile (390px) widths, failing on browser errors. All HTTP requests use a local test server with purely synthetic PUBG responses. This validates real browser rendering and navigation of checked-in code but does not verify the production Vercel deployment, Android hardware or physical Xbox browser. No external paid browser service, PUBG API requests or user data is involved.


### Browser-discovered sidebar and Content Security Policy fixes

A real Chrome smoke test found that the long desktop sidebar could overflow outside the visible sticky viewport. The sidebar is now independently vertically scrollable above mobile breakpoint, so all navigation tabs remain reachable. Chrome also surfaced CSP violations from chart-bar HTML style attributes. Mode and weapon bar dimensions are now applied through DOM CSSOM properties after rendering, preserving the strict script/style policy rather than adding unsafe-inline. The browser smoke test checks that a real chart bar has a rendered height and does not accept uncaught browser console errors.


## Unified HELP Clan training toolkit

The single PUBG Bot Vercel address will also serve the full public HELP Clan
PUBG Toolkit under /training/, with links from the Command Centre overview
and sidebar. The training website includes a return-navigation bridge to
player statistics and match replays.

The user-owned training repository is copied as a pinned source snapshot,
preserving creator-built scope sensitivity maths, recoil models, damage
and equipment calculators, original source parts, artwork credits, audit
documentation, and regression tests. These static features do not call
the PUBG API or Supabase and do not add new Vercel serverless functions.

Source: https://github.com/johnstacey16-ui/HELP-Clan-PUBG-Toolkit
Pin and import procedure: scripts/vendor-help-toolkit.sh
The original HELP website and GitHub repository are retained. Custom
empirical damage/ADS/sensitivity/recoil assumptions are not silently
merged into official API measurements.


### Toolkit test compatibility during migration

The upstream HELP tests deliberately assert exact original DOM, SVG resource paths and original .github workflow file. The import checks its untouched pinned source with the original generated-build, all calculator tests and Chrome layout smoke checks first. After inserting a namespaced static back-navigation bridge and correcting the mannequin asset path, separate integration tests validate the hosted copy. This prevents rewriting the creator's source tests or disguising differences as passes.


The original pinned HELP repository passes its 198 source/unit checks and its core real-Chrome eight-tool smoke in the import runner. Its separate legacy 320px hit-zone screenshot preview currently fails to find the neutral mannequin (a pre-existing optional preview check). The importer does not change core damage maths to hide this issue. That standalone visual acceptance remains an explicit follow-up and is not claimed to have passed.


### Integrated HELP browser acceptance

The main GitHub Chrome job now also runs tests/training-merged-smoke.js against a local static server that uses the actual combined /training/ URL structure. At 1280px and 390px viewports it checks the creator's six main training workspaces, real JS navigation, the original pinned SVG and sensitivity source asset paths, and the two-way Command Centre navigation bridge. The test fails on missing training resources or uncaught JavaScript errors. External analytics/fonts are stubbed; no live PUBG or production player data is accessed. These are real Chromium checks, not physical Xbox browser or live production acceptance.


### Hit-zone visual test fixture correction

The vendored legacy 320px preview runner previously served the neutral SVG mannequin with `application/octet-stream`. Its self-contained Chrome `Image()` decode could fail even though the preserved 13-region source was valid. The migrated runner now explicitly serves `.svg` as `image/svg+xml` and the real five-width Chrome preview is part of the combined CI gate. No authored SVG art, hit zones, damage equations, or publisher-source data is changed by this fixture fix.


### Public production HTTP acceptance

GitHub Actions now verifies the actual public `https://pubg-help-clan.vercel.app` host *after* the local Chrome job on a main-branch push. It checks nine public static GET resources: toolkit homepage, the Clan Dashboard, legacy `/training/` entry, the shared navigation CSS, the HELP theme CSS, the legacy player-link redirect script, the mannequin SVG, sensitivity JS and the original calculator bundle. It verifies content types and the links between the two app views. No PUBG, Supabase, or Discord APIs are contacted. A source deployment marked READY is not treated as proof of HTTP accessibility until this separate test passes. A protected/inaccessible URL causes an explicit failed external verification; no automatic bypass or paid upgrade is attempted.

### Releasing the unified HELP Clan layout

GitHub `main` contains the reviewed layout, but the public site changes only after Vercel successfully deploys the latest `main` commit to **production**. A Vercel Hobby build-rate-limit rejection can leave the live domain on a previous READY deployment; neither passing local Chrome checks nor merging into GitHub proves that the new layout is live.

Once the Vercel build quota allows it, use the existing **pubg-help-clan** Vercel project to deploy the latest `main` commit. Do not create a replacement project or change Discord secrets. Then open the [manual production HTTP verification workflow](https://github.com/johnstacey16-ui/pubg-help-clan/actions/workflows/production-release-check.yml) in GitHub Actions and click **Run workflow** on `main`. This runs read-only public HTTP GET checks for the current site; it never invokes paid services, PUBG API calls, Supabase writes or Discord refreshes.

When all nine public resources pass, run `/setup` in the already configured Discord dashboard channel to edit its permanent buttons to `/dashboard/`. The Discord Interactions Endpoint remains `https://pubg-help-clan.vercel.app/interactions`.


### Priority-based PUBG collection (first-fill + maintenance)

The default publisher API-key allowance is **10 rate-limited calls per minute**. A
single atomic Supabase budget now permits **10 reservations per rolling 65 seconds**;
background collection can use all **10** when no player has recently requested
fresh data. During the following ten-minute demand window, background stops
at **7** and reserves three slots for an unknown player's console lookup and
lifetime stats. No second API key, fake data, or in-memory-only
limiter is used. Official match detail and telemetry endpoints do not consume
that key quota, but we still cap per-run work and downloads.

- **Interactive:** Public search shows saved data immediately. An explicit
  refresh can request newer lifetime data after two minutes for the same
  player; all requests still pass the atomic global limit. Different visitors
  are no longer held behind one 90-second site-wide cooldown.
- **First fill:** Matched clan players get a persistent server-only job each
  for lifetime statistics, player match index, Weapon Mastery and Survival Mastery. The server
  fetches up to five unmetered match detail objects **per run** and continues
  in later runs until the entire returned recent-match index has been cached.
  Existing match details are skipped, and cached completed matches are reused.
  Actual current-season and ranked statistics are gradually collected
  separately with a two-call-per-player backfill.
- **Maintenance:** Repeated requests reuse cached responses and decline
  duplicate work. Season collection rotates verified accounts no more often
  than every 23 hours; lifetime and match indexes are eligible for a daily
  refresh, while weapon and survival mastery refresh weekly. Missing records
  are retried with capped backoff rather than fabricated. Player-triggered
  updates take priority.
- **Scheduling:** The free GitHub Actions runner runs twice daily and can be
  started manually. It uses GitHub's signed, short-lived OIDC identity to
  authenticate to the existing production API; **no GitHub secret is required**.
  The server verifies its signature using GitHub's published JWKS and exact
  immutable repository and owner IDs, workflow file, branch and event. The
  token can only access `/api/sync?mode=backfill`, not Discord admin updates.
  Work is bounded to 25 cycles of 66 seconds and exits as soon as no work is due.
- **Deployment:** Apply
  `supabase/migrations/20261104_maximum_pubg_priority_and_backfill.sql`
  **before** deploying code that calls the new background reservation RPC.
  Do not deploy the application change if its migration has not applied.
- **Limits:** This backfill covers real, supported resources for the verified
  stored clan roster, not every historical PUBG match ever played or all
  events on the service. Deep telemetry remains selected-match/on-demand to
  avoid downloading giant assets and flooding free hosting.


The adaptive limit is defined in `supabase/migrations/20261104_adaptive_pubg_user_priority.sql`. The first user arriving after a fully utilised idle period may still wait up to one rolling 65-second window; cached profiles remain readable in the meantime. This policy never exceeds the one-key ten-request budget.

### Fully embedded Clan Dashboard tool

The HELP Toolkit is the only visual shell. Its first sidebar tool is **Clan Dashboard** (`panel-clan`) with all 18 PUBG API data sections rendered as sub-tabs in the same DOM and styled with the trainer's typography, header, controls and palette. **Back to Toolkit** returns to the previously active training tool, including on mobile. There is no iframe and dashboard assets load only when the tool is opened. `/dashboard/#player/...`, Discord buttons and old deep links open the same integrated panel; `/index.html` redirects to `/dashboard/`. See `training/clan-dashboard-shell.css`, `training/clan-dashboard-scoped.css`, and `training/js/clan-dashboard-loader.js`.

#### GitHub catch-up collector without duplicated secrets

`Collect missing PUBG clan data` uses GitHub Actions OIDC (`id-token: write`)
to request a signed token for each short `/api/sync?mode=backfill` call. The
server validates the immutable repository subject, repository/owner numeric IDs,
`main` branch, workflow filename, scheduled/manual event, token expiry, expected
audience and the RSA signature against GitHub's pinned-issuer JWKS. Existing
Vercel `CRON_SECRET` keeps protecting the original daily cron. Neither PUBG
API credentials nor the Vercel cron secret is copied into GitHub Actions.

On GitHub Actions → Collect missing PUBG clan data → Run workflow (main),
start an on-demand catch-up. Otherwise the scheduled runner starts twice daily.
The database's own 10-request/65-second limiter always controls upstream calls.
