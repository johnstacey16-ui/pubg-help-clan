# AGENTS.md — PUBG HELP Clan project rules

These rules apply to the **PUBG HELP Clan website, dashboard, training toolkit, Vercel API and Discord bot** in this repository. Read [README.md](README.md) and [ROADMAP.md](ROADMAP.md) before changing anything. This is the **canonical application**; do not resurrect the older dashboard or clone the retired training-toolkit repository.

## Find and reuse code first

1. **Search before writing.** Check existing code, tests, database migrations, shared helpers, source dictionaries and UI before adding a feature. Fix or extend its existing owner. Avoid duplicated PUBG lookups, rate limiters, match parsers, caching or statistics calculations.
2. **One clear job per file.** New modules should be small, named by their purpose and ideally **300 lines or fewer**, with readable formatting. This is a target for new and touched code, **not an order to split every existing large file immediately**. If a file is too big to understand, extract one cohesive area at a time with tests.
3. **Prefer existing folder boundaries**, rather than creating duplicate frameworks or moving everything at once:
   - `training/`: independent static practice pages, their styles, calculations and original asset references.
   - `assets/`: shared dashboard/browser interface scripts, reusable view components and styling. Put entire new screens near their existing screen/view owners; use `pages/` only if it actually simplifies distinct new pages and is supported by routing.
   - `api/`: Vercel serverless request handlers, method and request validation, response shaping.
   - `lib/`: reusable trusted-side PUBG, Discord, caching, statistics, roster, rate-budget and security logic used by API handlers and jobs.
   - `supabase/migrations/`: versioned database functions, grants, RLS and schema changes. Source-of-truth player, clan and match data lives in Supabase, **not** user-supplied browser data.
   - `tests/` and `scripts/`: executable regression/browser checks and repository utilities.
   - A new `data/` module is appropriate only for real shared reference/configuration data. Never move privileged database clients, credentials, or stored player records into public static files merely to match a folder naming rule.
4. **Refactor without changing behavior silently.** Update all imports/require paths, `index.html`, `training/`, `vercel.json`, API routes and GitHub Actions when moving code. Preserve Discord interaction routing and toolkit/dashboard navigation. Avoid unnecessary new serverless functions on the free plan.

## Security — distrust every client value

5. **Validate at the authoritative boundary.** Never accept client-submitted numbers, stats, match results, platforms, account IDs, roles, ranks, clan membership, ownership flags, timestamps, access rights or rate-limit claims as truth. Validate type, schema, length, formats, allowed Xbox/PlayStation shards, ranges, request method and size; derive any critical values from verified PUBG responses and authoritative Supabase state.
6. **Authenticate privileged actions.** Verify Discord Ed25519 signatures against the **raw request body** before executing interactions; retain guild/role checks for roster administration. Validate GitHub Actions OIDC claims for authorized backfills. Public read APIs must not become unrestricted admin/mutation APIs. Same-origin and CORS checks do **not** replace authentication or authorization.
7. **Keep secrets off the browser.** PUBG_API_KEY, SUPABASE_SERVICE_KEY, Discord credentials, CRON_SECRET, Groq keys and any privileged token must remain in server-side environment variables. Do not commit secrets, embed service-role access in `assets/` or `training/`, or leak them in logs/errors/API responses.
8. **Use atomic server-side limits.** Reuse the existing shared Supabase budget and cooldown RPCs for all official PUBG calls, Discord/website refreshes, imports and backfills. Never rely on serverless in-memory state alone or allow retries to bypass limits. Treat failed upstream calls or missing observations as unknown, never zero.
9. **Database access is a security boundary.** Review grants/RLS and private tables before exposing data. Do not silently mark discovered players as official HELP Clan members. Recalculate leaderboard and rivalry results from authentic saved sources. Rate-limit and bound public requests and redact private identifiers.
10. **Only report real evidence.** Separate official observed PUBG stats, cached/old stats, incomplete sample sizes and the training toolkit's empirical calculators. Do not invent kills, damage, rankings, match positions, timestamps or confidence. No 2D replay, position-track or map-playback features: the owner explicitly excluded them in [ROADMAP.md](ROADMAP.md).

## Controlled publishing on Vercel

GitHub `main` development commits are **not** automatic live releases: `vercel.json` uses `scripts/vercel-deployment-gate.mjs` to skip builds unless a commit message has an explicit standalone `[deploy]` marker. Never add this marker to routine docs/code/test commits. The owner authorizes ongoing game/tool development, **not automatic production publication**. Before a release, verify `npm test`, `npm run check`, relevant GitHub/Chrome checks, and free-tier hosting limits; intentionally publish with one `[deploy]` release commit, then verify Vercel READY, production revision, website/API and Discord behavior. The gate only controls Git-triggered builds and doesn't stop authorized manual deployments. [README instructions](README.md#controlled-vercel-releases-10-november-2026).

## Test, hosting and delivery

11. Run `npm test` and `npm run check` for application changes, with focused security/API/browser tests when relevant. Test malformed input, unauthenticated calls, duplicate requests, rate limits, data privacy, frontend compatibility and expected user flows.
12. Keep the existing **free-only** Vercel Hobby/Supabase/Discord setup and working endpoints. Avoid new subscriptions, paid infrastructure, duplicate databases or additional hosted functions without a proved need. Never deploy or modify production secrets or destructive database state without the owner's explicit instruction; commit development work with an accurate verified/untested status.
13. Prioritize completing the application over cosmetic refactors. Apply these principles as new work is undertaken; don't stop feature delivery merely to enforce an arbitrary line count. Keep current source references, artwork licenses, static trainer calculations and existing verified data intact.
