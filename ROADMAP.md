# PUBG Console Platform — Roadmap

**Repository:** johnstacey16-ui/pubg-help-clan  
**Production target:** https://pubg-help-clan.vercel.app (HELP Toolkit); `/dashboard/` (Clan Dashboard)  
**Services:** existing Vercel Hobby, Supabase, official PUBG console API, Discord bot  
**Permanent exclusion (owner decision, 2026-11-08):** Never build, enable or reintroduce 2D replay visualizations, position tracks, map playback or replay controls. Maintain existing combat, squad, match and rival statistics without spatial replay data. This supersedes earlier replay requests.  
**Rules:** free hosting where possible; never expose credentials; Xbox & PlayStation only; 2D replays, position maps, animated tracks and playback are permanently excluded by the project owner; genuine non-spatial match/telemetry statistics are permitted; complete checks only when tests pass.

## Completed in the initial web-app foundation (2026-11-03)

- [x] Audit current bot routes, Supabase schema, hosting and build configuration
- [x] Choose a shared-repo and shared-database architecture (no new paid service)
- [x] Save an original design system and editable SVG picture references in `design/`
- [x] Add a standalone responsive dark-theme website at `/`
- [x] Preserve existing Discord interaction, sync and health endpoints
- [x] Add a read-only public web API returning **official clan** data only
- [x] Keep service-role, Discord, Groq and PUBG API secrets on the server
- [x] Build overview, sortable leaderboard, searchable roster, per-player mode details and comparisons
- [x] Add visualizations from real stored mode data; no invented statistics
- [x] Test web response shaping, routes and sensitive-data exclusion with development checks (19/19 passed)
- [x] Run all repository Node tests in independent GitHub Actions CI (last verified GitHub Actions run on 2026-11-03; workflow installs pinned backend dependencies)

## Deployment and acceptance gates

- [x] Vercel deployment READY for initial web foundation commit f73041b; production alias confirmed
- [ ] Verify the homepage and `/api/public-stats` using a real HTTP/browser request (external HTTP inspection was blocked in the current environment)
- [ ] Confirm /interactions, /api/health, /api/sync and Discord dashboard still work
- [ ] Verify real production layout in Chromium and phone screen size (local headless Chrome desktop/mobile regression job added; verify its CI result before marking it passed)
- [ ] Verify browser security headers and safe public data with production responses

## Next development phases

### Phase 2 — Complete profiles and discovery
- [ ] Player search across tracked accounts with consent/public visibility policy
- [x] Add real advanced lifetime profile metrics and per-mode comparisons (damage, headshots, assists, knockdowns, revives and Top 10s)
- [x] Add real cached weapon-mastery table, level/tier/XP, detailed stats and visual kill bars
- [x] Read-only verified-clan weapon comparison by saved Official/Competitive/legacy source: observed metric coverage, totals and maximum longest kills, searchable weapon ranking, top-five real player lists, source-safe CSV, on-demand load, and no extra PUBG requests.
- [ ] Expand historical weapon-mastery collection to more verified players only through the existing shared PUBG budget; observe real cache coverage before claiming completion.
- [x] Shareable console player links (`/#player/xbox/<name>` or `/#player/psn/<name>`) and per-player detail panels
- [x] Real daily snapshots from all PUBG player updates, including baseline captured at the real last-fetch timestamp
- [x] Read-only private-table-backed history API for saved console players, without revealing database IDs
- [x] Historical SVG charts that appear **only after two or more real snapshots**
- [x] Roster pagination, name/kills/wins/favourites sorting, console/status/favourites filters and on-device saved clan favourites (no account or database required)
- [ ] Verify a second genuine snapshot and resulting public chart after an actual PUBG refresh
- [x] Validate shareable profile links and real-history baseline/line-chart behaviour in a simulated browser
- [x] Handle ambiguous platform searches openly, requesting a console choice only if both shards return a matching gamertag

### Phase 2B — Public console player discovery and protected website refresh
- [x] Search any saved Xbox or PlayStation gamertag from the website
- [x] Web-based lifetime PUBG refresh using the existing shared Discord API budget
- [x] Global and per-player website cooldowns through a private atomic Supabase RPC
- [x] Individual profile, weapon, match and history views for saved players outside the clan
- [x] Retain official clan-only totals and separately track searched outsiders
- [x] Shareable platform-specific links for arbitrary saved players
- [x] Auto-detect a new player's console, save that one account, and reuse its confirmed platform/account ID on future refreshes
- [x] Preserve official clan membership labels when the player is found through Auto-detect
- [x] Accept omitted platform on website API requests as Auto-detect (no second account required)
- [x] If both console shards return matching names, request a manual console choice instead of creating duplicate profiles
- [ ] Evaluate genuinely distinct Xbox and PSN accounts sharing an identical displayed name only if this becomes a real requirement
- [x] Website PUBG refresh for weapon mastery, recent matches, current season and ranked
- [x] Per-player, per-refresh-type 15-minute cooldown plus shared 90-second global web limit
- [x] Bound recent match detail refresh to five match IDs; use PUBG's non-rate-limited console matches endpoint
- [x] Explicit season-list revalidation so stale 30-day season indexes do not hide new seasons
- [x] Current Season & Ranked page using sanitised cached statistics and honest empty states
- [x] Store observed PUBG season/ranked stats per mode in a compact private hourly archive (18-month retention)
- [x] Capture new observations automatically whenever Discord or the website caches a genuine season or ranked response
- [x] Backfill one real cached ranked response at its original fetch timestamp (six mode records; **not six dates**)
- [x] Show only real observed season kills / ranked points on the Season & Ranked page, with no line until two observations exist
- [x] Preserve older season IDs when the current PUBG season changes
- [ ] Verify progression charts with two different genuine refresh timestamps from PUBG production
- [ ] End-to-end production browser, Android and Xbox validation

### Phase 3 — Match intelligence, combat events and opponent analysis
- [x] Read-only cached PUBG match-intelligence API for saved console players (no public upstream calls)
- [x] Responsive Match Intelligence website tab with optional squad breakdown
- [x] Verify match-cache shape in Supabase; use existing Discord /recent to populate
- [x] Persistent match archive for all saved Xbox/PS players, 180-day retention, daily pruning through protected cron
- [x] Verified automated collector remains active: on 2026-11-07, all 50 cached console-player indexes had been refreshed within 24 hours; 48/50 profile jobs were done and two pending under the shared rate budget.
- [x] Historical clan match leaderboard with server-only verified-member aggregation, rolling 7/30/180-day comparisons, map/mode and minimum-sample filters, observed survival and kill/damage rates, peer comparisons and formula-safe CSV; unique matches and player-match observations are explicitly distinct.
- [x] Source-only clan single-match record book: top five different verified players' genuine archived personal bests in ten PUBG participant categories, with 7/30/180-day windows, map/mode/date, sample coverage and no telemetry or new PUBG requests.
- [x] Read-only Clan Activity Pulse: true UTC calendar-day match archive activity (7/30/180 days), distinct match IDs versus player-match observations, observed kills/wins, active players, coverage and 180-day weekly bucketing. No new PUBG API requests, replay downloads, functions or paid services.
- [x] Backfill three genuine saved match reports without using the PUBG API
- [x] Private RLS and verified console-player lookup; public output uses an explicit field allowlist
- [ ] Confirm trigger archiving on the next newly retrieved PUBG match in production
- [x] Archived match details and squad breakdown on the website
- [x] Official cached full-lobby viewer for verified saved console-player matches: recorded squad placements, all source participant stats, team aggregates with per-field coverage, searchable player scoreboard and formula-safe CSV; no additional PUBG calls, IDs, secrets or fabricated missing lobbies.
- [x] Retain sanitized official full-match squad and participant observations for up to 180 days beyond the ordinary 30-day match cache, with verified account participation, bounded compact storage, RLS/service-only access, existing saved-match trigger, and authenticated daily pruning. No PUBG API calls, telemetry URLs or synthetic team reconstructions.
- [x] Official full-lobby Opponent Scouting: choose a saved console player and view source-proven other-squad participant appearances from up to 75 recent saved match references; 7/30/180-day, map/mode, sort and visible-name filters; whole-match kills, damage with observed-value counts, recorded placement, name collisions, individual source match drilldowns and formula-safe CSV. Visible name is not an account identity; whole-match stats are not direct head-to-head combat. Only official roster assignments count; no telemetry, spatial replay, API key calls, new Vercel function or paid infrastructure.
- [ ] Validate saved-lobby scouting against live production API and a newly archived match; check selected player source coverage with real records.
- [x] Initial production backfill on 2026-11-07: all 1,540 available genuine saved full-match payloads retained in the new sanitized archive, using about 28 MB. The scan confirmed zero URL/token/secret fields in archived source data; the archive RPC is service-role-only.
- [ ] Verify that the next newly saved official match automatically enters the compact 180-day archive and that the existing daily cron prunes expired rows. Pre-existing expired source reports cannot be reconstructed.
- [x] Recurring teammate analysis from real archived squads (games, wins, kills, damage and last played)
- [x] Player-first Personal Kill Rivalries panel: highest recorded direct-kill victims, highest recorded direct killers, kill differences, opponent-by-opponent actual kill counts and source-match drilldowns. Reads existing analysed telemetry without upstream calls; saves compact match-specific rivalry observations for up to 180 days from actual match play in the existing private Supabase cache (no new schema); no claim of verified cross-match identities from visible labels or complete lifetime coverage. Xbox/phone friendly; no spatial replay.
- [x] Verified, cache-only telemetry Rival Intelligence: observed opponent encounter counts, map/mode/date filters, searchable and sortable visible-name lists, per-metric damage coverage, and bounded match-by-match source-only drilldowns. Uses only already analysed telemetry and never assumes matching display names confirm account identity.
- [ ] Verify multiple genuine production telemetry reports and the resulting opponent trend/drilldowns on actual records; missing stored analyses must remain an honest empty state.
- [x] Weapon mastery views documenting StatsTotal, OfficialStatsTotal, CompetitiveStatsTotal, LevelCurrent, TierCurrent and XPTotal (separate categories)
- [x] Real historical season/ranked snapshots and per-mode progression charts
- [x] Historical season/ranked clan leaderboards from latest genuine per-player, per-mode, per-season observations with source timestamps (server-only SQL RPC, API, and website)
- [x] Add persistent, budget-limited daily season/ranked collection for verified clan players through the existing Vercel cron (two players per run)
- [ ] Verify historical clan leaderboard on live website with multiple real player snapshots
- [ ] Observe and verify the next genuine production daily season/ranked collection

### Legacy console dashboard migration

- [x] Import and attribute seven pinned publisher dictionaries without private player data or another API
- [x] Add public-safe saved PUBG source explorer for profile, seasons, ranked, mastery, survival and match fields, including typed nested paths and safe JSON download
- [x] Integrate bounded real match-local combat and event-level rival analysis (secure publisher-only telemetry URL, shared web cooldown, persistent derived Supabase cache, no extra API key). The retired 2D replay functionality is not part of the product.
- [ ] Verify genuine combat-event telemetry processing on a newly fetched production match without 2D replay.
- [x] Official regional/season leaderboard page with exact API rank/metric fields, saved cache reuse, 90-second shared web cooldown and atomic shared PUBG requests; corrected for the post-Season-7 no-page-filter endpoint
- [ ] Validate official regional leaderboard live against a genuine returned production response
- [ ] Complete telemetry source browsing, player activity, sample and tournament resources
- [ ] Verify migrated features using production API, Chromium and console browsers
- [ ] Retain old private source until feature parity and acceptance; no deletion

- [x] Safe on-demand Data Health page with real Supabase cache and budget summaries (8 reserved API calls per 65 seconds); no new Vercel function
- [x] On-demand verified-clan collection health and freshness monitoring: genuine 24/48-hour player last-check coverage, archived match write time versus game-played time, backfill stages and ready-for-retry counts, plus observed season collector state. Query only when Data Health is opened; no PUBG requests, new Vercel function, or background polling. No-upstream-check proof is inferred from cache/job completion.
- [ ] Complete final old-dashboard migration matrix and browser/device acceptance

### Phase 4 — Secure updates and Discord integration
- [ ] Authenticated manager-only website refresh using existing budget and database lock
- [x] Discord dashboard **View full dashboard** link
- [x] Configurable Discord clan membership management: signed Discord Manage Server `/clanmanage add/remove/status/audit` actions, service-role-only transactional membership toggles and append-only audit with replay protection; the existing shared-budget importer still verifies names before counting them as matched.
- [ ] Deploy the roster-admin Supabase migration and confirm Discord command registration and real manager actions only after a production Vercel release is authorized; no live membership changes or PUBG fetches in this PR.
- [x] Audit legacy Supabase grants and secure `players`, `matches`, `clan_records` (RLS enabled; anonymous/authenticated access revoked; service-role preserved)
- [x] Adapt legacy Command Centre awards, experimental roles, optional clan percentile ratings and What-if policy controls
- [x] Add an SVG percentile comparison radar based on actual saved mode data
- [x] Show real 6–14 day snapshot progress through a private Supabase RPC; flag counter resets and missing baselines
- [x] Add real 1/3/7/14-day observed snapshot comparisons and four cautious interval momentum awards (3+ genuinely added matches, no counter reset), with actual before/after timestamps, no interpolation, and honest empty 7/14-day states until evidence arrives. Reuses existing progress Vercel function; no extra PUBG requests.
- [x] Add local-only validated CSV historical comparison, official CSV export, labelled source-only bot scatter, data quality flags, and analytics glossary
- [ ] Add genuine multi-observation consistency awards when enough historical samples exist (as of 2026-11-07: only Nov 3–7 snapshots exist, so no player yet has a valid 6–14-day comparison; do not invent award winners)
  - The new short-window momentum awards are *not* lifetime consistency trophies; genuine consistency still needs multiple non-overlapping observed windows.
- [ ] Add authenticated manager-only persistent CSV imports with auditable source provenance
- [ ] Verify the new Command Centre views in production browsers, Android and Xbox
- [ ] Accessibility and performance regression gate

### Phase 5 — Production hardening
- [x] Full automated Node regression suite: regression suite checked via GitHub Actions on 2026-11-03
- [ ] Complete live desktop, Android and Xbox browser checks
- [ ] External error alerting and operational incident notifications (no always-on paid monitor required)
- [x] Read-only stale player-check flags, collector backfill task states and retry readiness, archive event-vs-ingest clocks on Data Health; existing budget backoff and retries remain unchanged.
- [x] Consolidate new API handlers into the existing 12 Hobby-compatible Vercel functions (no paid upgrade or separate backend)
- [ ] Confirm free-tier usage, hosting and API-request budgets
- [ ] Validate layout and interaction on Xbox browser (hardware acceptance separately)

## Asset provenance

The older inspiration images shown conversationally were externally selected illustrative searches, **not supplied source files or owned artwork**, so their exact image bytes aren't available for committing into GitHub. Instead, `design/` contains **new original editable SVG picture references** drawn for this project and an original UI theme. Those files are safe to version, inspect and adapt. No screenshots or fake PUBG data are represented as real stats.

## Architecture

```text
Website  /                 /assets/css/site.css, /assets/js/site.js
   |                      /design/*.svg original references
   | GET /api/public-stats  (sanitized, official roster only; read-only)
   v
Existing server-side Supabase service role --> saved verified statistics
Existing Discord /interactions & /api/sync --> shared rate-limited PUBG data collection
```

Ordinary website reads use saved Supabase data and never spend PUBG API capacity. Explicit **Refresh from PUBG** requests run through a server-side Vercel function, an additional web cooldown and the same atomic shared PUBG request limit as Discord. Unknown gamertags are checked on Xbox and PSN once; known account IDs and platforms are reused. PUBG telemetry is used for genuine combat reports, event histories and opponent statistics only. No coordinate maps, positional tracks, video replay or playback is part of the product.


## HELP Clan training toolkit merger (4 November 2026)

Target: one PUBG Command Centre web address. Keep source modular: official
player/match statistics stay in the existing Supabase/Discord server, while
weapon, sensitivity, hit-zone, recoil and backpack tools run as standalone
client-side pages under /training/.

- [x] Confirm original HELP-Clan-PUBG-Toolkit GitHub repository is public and user-owned.
- [x] Pin its public source to a stable commit without modifying creator-built maths or using additional API keys.
- [x] Import all 267 training files, including creator source sections, publisher artwork, asset credits, research and original tests, into the namespaced /training/ directory.
- [x] Add accessible navigation to Training from the Command Centre sidebar and overview and back to player stats/match intelligence.
- [x] Use static Vercel routing within the existing project, with no increase beyond 12 serverless functions.
- [x] Verify 198/198 original source tests and the original real-Chrome eight-tool core smoke before applying namespaced navigation.
- [x] Validate preserved assets, source attribution, redirect/route configuration and 12-function cap.
- [x] Verify combined GitHub PR branch with standard Node and real desktop/mobile Chromium smoke checks (run 41753197183).
- [x] Vercel production READY on merged app commit `12be7e5` at the existing public alias; local Chrome passed at 390px and 1280px. Independent public HTTP response checks remain gated separately.
- [ ] Confirm six actual public HTTP resources under `/training/` resolve correctly using the new GitHub-hosted production-static-smoke job.
- [ ] Inspect trainer↔statistics navigation, original calculation examples and responsive layout on production Chrome, Android and physical Xbox Edge.
- [x] Fixed isolated preview server's SVG MIME; the real Chrome 13-hit-zone mannequin check passed at 320, 360, 390, 768 and 1280px, no changes to creator damage models (CI run `41757883122`).
- [ ] Check 2026 weapon/attachment data freshness against its source methodology before implying exact current-patch values; retain provenance and "unknown" distinctions.
- [ ] Reassess branding/cosmetic consistency and a possible old-domain redirect only after production acceptance. Keep the old HELP repository and Vercel address available for rollback; do not delete without a separate explicit request.

The toolkit contains creator-derived sensitivity/recoil/TTK models. They are
not official API stat measurements and must not be silently blended with
saved PUBG lifetime/season/player records. Publisher artwork attribution
and empirical-model disclosure remain available in training documents.
