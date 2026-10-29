# Settlement

A tour-routing desk for independent musicians and comedians. Type a public act name. The agent finds cities where that audience already lives (Qloo heatmaps), routes a drivable run, picks rooms that share the crowd, suggests local openers, and writes a promo brief for each stop.

Working title lives in [`lib/config.ts`](lib/config.ts) (`APP_NAME`). Override with `NEXT_PUBLIC_APP_NAME` if you rename it.

Built for the [Qloo Agentic Hackathon](https://qloo.devpost.com/) against the official kit ([qloo/qloo-hackathon-kit](https://github.com/qloo/qloo-hackathon-kit)). MIT licensed. Submission notes: [`docs/SUBMISSION.md`](docs/SUBMISSION.md).

## Qloo-powered

Every city, room, opener, podcast, bar, and brand in a live plan comes from the Qloo Taste AI API on the hackathon host (`https://hackathon.api.qloo.com`):

- `/search` and `/entities` resolve the act.
- `/v2/insights` with `filter.type=urn:heatmap` finds where the act's audience clusters across the lower 48.
- `/v2/insights` for places (fixed venue and comedy-club tags), artists or comedians (openers), podcasts, bars, and brands fills each stop.
- `/v2/insights/compare` scores headliner and opener audience overlap.

Settlement adds routing (drive caps, nearest-neighbor + 2-opt), honest labels when Qloo comes back thin, and the share page. The Qloo key stays on the server; no personal data is sent.

## 1. Product problem

Bookers still guess the next city. Settlement turns Qloo group-taste geography into a shareable run: cities first, then rooms, openers, and promo facts. Results describe where a crowd already clusters. They do not predict what any one person will do.

## 2. Qloo workflows used

The event supports `qloo exec` and `qloo mcp` from `@qloo/qloo-harness` (>= 0.1.26). Those surfaces expose nine workflows. Settlement cites them and answers the same questions on the documented REST API (`GET` + `X-Api-Key` at `https://hackathon.api.qloo.com`) inside the Next.js server.

We do not spawn `qloo exec` or `qloo mcp` from the web app. A Vercel or serverless host cannot keep a stdio MCP process, the judge path must run in mock without a global harness, and our allow-list plus call budget live in TypeScript. Wrapping each step in a CLI subprocess would weaken the demo.

| Harness workflow | In Settlement | Why it fits |
|---|---|---|
| `describe` | Yes | Resolve a public act name via `/search` + `/entities` |
| `where_popular` | Yes | National heatmap via `filter.type=urn:heatmap`, cells snapped to tour cities |
| `find_tags` | Yes | Music-venue / comedy-club tag ids from `/v2/tags` |
| `recommend` | Yes | Rooms, openers, podcasts, bars, brands for that crowd |
| `rank` | Yes | Affinity minus drive cost, nearest-neighbor + 2-opt |
| `compare_audiences` | Yes | Headliner vs opener overlap via `/v2/insights/compare` |
| `entity_tags` | Yes | Shared taste tags for promo briefs |
| `trends` | No (live) | `/trends/entity` answers 404 on the hackathon host, so live mode skips it and hides momentum. Mock mode still shows a synthetic figure. |
| `audience_demographics` | No | Geography and affinity are enough; demographic inference is out of scope |

Mapping source: [`lib/qloo/workflows.ts`](lib/qloo/workflows.ts). The desk radio prints the matching `qloo_*` label next to each REST path.

## 3. Request to result (redacted)

Example: MJ Lenderman, 8 shows, 6h drive cap, first Friday about eight weeks out.

1. `GET /search?query=MJ%20Lenderman&types=urn:entity:artist,urn:entity:person` then `GET /entities` → entity id (mock uses a synthetic UUID). Search always returns its closest hits, so Settlement only routes an exact name match and otherwise answers "Did you mean".
2. `GET /v2/insights?filter.type=urn:heatmap&filter.location=POLYGON((-125 24, -66 24, -66 49.5, -125 49.5, -125 24))&signal.interests.entities=<id>` → one national grid of unnamed geohash cells. Each cell snaps to the nearest tour city within 40 miles; a city scores its best cell's affinity × popularity. One call keeps every city on the same scale. (`output.heatmap.boundary=city` answers 400 on the hackathon host, and free-text regions resolve unpredictably, so neither is used.)
3. Local rank under the drive cap → ordered stops (Chicago → Milwaukee → …).
4. Place insights in each city with a fixed tag (`urn:tag:category:place:live_music_venue` or `urn:tag:genre:place:comedy_club`) and the act as signal. Qloo has no capacity field, so room size comes only from Qloo tags (Intimate, Cozy, Concert hall, Performing arts theater) and reads "Size unknown" otherwise.
5. One artist or person insights call per plan, capped at the headliner's popularity, then `/v2/insights/compare` for each stop's lead opener. Overlap is the mean of the top five shared tag scores (compare returns no single overlap number). See "Openers" below.
6. Tag / podcast / place / brand insights → promo brief. Routing is ours, not Qloo.

No user name, email, device id, or account id is sent. Inputs are a public act name and optional start city. `.env.example` keeps `QLOO_API_KEY` empty. Live responses are cached only on the server (`.data/`, gitignored, or the Convex `qlooCache` table when deployed).

## 4. Demo

Judge path: open the app, click one of the three tickets, or type any name. No signup. First date defaults to about eight weeks out (a Friday). A map and stop list should land in well under 30 seconds in mock mode. The atlas draws the route even if map tiles are blocked.

Screenshots of live plans (no credentials, no personal data): [`docs/demo/`](docs/demo/).

## 5. Setup from a clean environment

Needs Node 22. The official harness, if you install it for local `qloo exec` experiments, wants 22.19.0+. Settlement itself does not require the harness.

```bash
npm install
cp .env.example .env.local
# leave QLOO_MODE=mock and keys empty for the full demo
npm run dev
```

Open [http://127.0.0.1:4567](http://127.0.0.1:4567).

```bash
npm run test        # routing, Qloo params, key-leak, public-signal checks
npm run typecheck
npm run lint
npm run build
npm run smoke       # mock contract; use QLOO_MODE=live QLOO_API_KEY=... once the key arrives
```

Live mode (after the event key arrives):

```bash
# QLOO_API_KEY stays in the shell or .env.local. Never NEXT_PUBLIC_*. Never the repo.
export QLOO_MODE=live
export QLOO_API_KEY="event-issued key"
npm run smoke
npm run dev
```

The live client is locked to `https://hackathon.api.qloo.com` and always appends a path. Staging and production hosts return 401. Do not use `/recommendations` or `/recs`. Insights are `GET` with query-string params and an `X-Api-Key` header (never Bearer, never a query param).

Optional local harness (not used by the app):

```bash
npm install --global @qloo/qloo-harness
qloo --version   # 0.1.26 or newer
qloo setup --qloo
qloo exec find_tags --input '{"query":"music venue","limit":3}'
```

## 6. What the result does not establish

- It does not say a named person will attend, buy, or like a show.
- It does not infer identity, health, politics, credit, or employment.
- Heatmap cities are aggregate affinity, not ticket counts.
- Room size comes only from Qloo tags (Intimate, Concert hall, and so on). Without one the stop reads "Size unknown". Qloo has no capacity field.
- Mock fixtures in [`lib/qloo/fixtures.ts`](lib/qloo/fixtures.ts) are hand-written synthetic data. They are not copies of live Qloo responses. This repo will be public, so no real Qloo payload is committed.
- Live coverage can be thin. The desk leaves a Hold on the room instead of inventing one.
- OpenRouter, when present, only rewrites facts already returned by Qloo.

## Environment

| Variable | Required | Purpose |
|---|---|---|
| `QLOO_MODE` | no (default `mock`) | `mock` or `live` |
| `QLOO_API_KEY` | live only | Event key. Server-side only. Never `NEXT_PUBLIC_*`. |
| `QLOO_BASE_URL` | unused | Documented in `.env.example` only. The live client ignores overrides and stays on `https://hackathon.api.qloo.com`. |
| `OPENROUTER_API_KEY` | no | If absent, briefs are deterministic fallback text |
| `OPENROUTER_MODEL` | no | Default `openai/gpt-4o-mini` |
| `NEXT_PUBLIC_APP_NAME` | no | Rename the product |
| `CONVEX_URL` | on Vercel | Convex deployment URL (`https://<name>.convex.cloud`). Set: plans, share links, Qloo cache, and the rate limiter use Convex. Unset: file store under `.data/`. Server-side only. |
| `ADVANCE_STORE_SECRET` | with `CONVEX_URL` | Shared secret, 24+ chars. Set the same value on Vercel and on the Convex deployment. Every Convex function rejects calls without it. |
| `CONVEX_DEPLOY_KEY` | CI only | Production deploy key for `npx convex deploy` in the Vercel build. Not read by the app. |

Never commit keys. `.env*` is gitignored except `.env.example`. `QLOO_API_KEY` is read only in [`lib/qloo/live.ts`](lib/qloo/live.ts), which is imported from the Node route [`app/api/plans/route.ts`](app/api/plans/route.ts). A leak test fails if the name (or a set value) can reach a `"use client"` graph or `.next/static`.

## Mocked versus real

| Piece | Mock (`QLOO_MODE=mock`) | Live |
|---|---|---|
| Qloo entities, heatmaps, tags, compare, trends | Synthetic fixtures shaped like the documented schema. Not copies of Qloo data. | `https://hackathon.api.qloo.com` with `X-Api-Key` |
| Routing | Real algorithm, same in both modes | Same |
| Writing | Deterministic briefs if no OpenRouter key | OpenRouter if `OPENROUTER_API_KEY` is set |
| Share links, Qloo cache, rate limit | File store under `.data/` (in-memory rate limit) | Convex when `CONVEX_URL` is set, else the file store |

The three example tickets name real public acts (MJ Lenderman, Sam Morril, Wednesday) so live mode resolves them through Qloo search. In mock mode their ids, cities, rooms, and openers are invented. Because the repository will be public, every mock fixture is hand-written in the repo. Do not paste live Qloo JSON into `lib/qloo/fixtures.ts` or anywhere else that is committed. Live responses are cached only under `.data/` (gitignored) on the server.

Invalid Qloo parameters fail silently with empty results. Every insights call is checked against a per-`filter.type` allow-list in [`lib/qloo/validate.ts`](lib/qloo/validate.ts) before it is sent.

## Architecture

- Next.js App Router on Vercel.
- One Qloo client: [`lib/qloo/client.ts`](lib/qloo/client.ts).
- Agent loop: [`lib/agent/run.ts`](lib/agent/run.ts). Same tools with or without a model key.
- Storage: [`lib/storage`](lib/storage). `CONVEX_URL` set picks the Convex adapter ([`convex-store.ts`](lib/storage/convex-store.ts)); otherwise the file store. Same interface for plans, steps, the Qloo cache, and the rate limiter. Functions live in [`convex/`](convex/).
- Map: offline CONUS SVG atlas always (route, numbered stops, city labels). MapLibre + OpenFreeMap tiles load on top when they are reachable.

## Deploy to Vercel with Convex

Vercel's disk is read-only and each instance has its own memory, so the file store cannot hold share links there. Use Convex.

1. Create the Convex project once from your machine: `npx convex dev --once`. This logs you in, creates the project, writes `convex/_generated/`, and pushes the schema to a dev deployment.
2. Make a secret: `openssl rand -hex 32`. Keep it out of the repo.
3. Put it on the production Convex deployment, read from stdin so it stays out of shell history: `npx convex env --prod set ADVANCE_STORE_SECRET` and paste the value at the prompt.
4. Deploy the functions and schema: `npx convex deploy` (asks to confirm production). It typechecks `convex/`, regenerates `convex/_generated/`, and pushes `plans`, `qlooCache`, and `rateLimits`.
5. In Vercel project settings, add for Production: `CONVEX_URL` (the prod URL printed by step 4, also in the Convex dashboard), `ADVANCE_STORE_SECRET` (same value as step 3), `QLOO_MODE=live`, `QLOO_API_KEY`. Leave `OPENROUTER_API_KEY` unset unless you want model-written briefs.
6. Optional: let each Vercel build push Convex too. Add `CONVEX_DEPLOY_KEY` (Convex dashboard, production deploy key) to Vercel and set the build command to `npx convex deploy --cmd 'npm run build'`.
7. Warm the demo cache after deploying, from a shell with the production values loaded: `QLOO_MODE=live npx tsx scripts/warm-cache.ts`. It runs the three demo acts with the same request the landing links send, writes only trimmed Qloo responses to `qlooCache`, saves no plans, and prints counts only.

Notes:

- Convex functions are public endpoints. Each one checks `ADVANCE_STORE_SECRET` and fails closed if it is unset. Never expose the secret or `CONVEX_URL` through `NEXT_PUBLIC_*`.
- Rate-limit keys are salted SHA-256 hashes of the client IP. Raw IPs are not stored.
- Cached Qloo payloads are trimmed before storage (names, ids, tags, scores, short text). A national heatmap drops from about 1.5 MB to about 110 KB, under the 1 MiB Convex document limit. Anything still over 900 KB is not cached.

## Openers

Probed Oct 20, 2026: for `urn:entity:artist` and `urn:entity:person`, `signal.location` (POINT plus 50 km radius, weight `very_high`), `signal.location.query`, and `filter.location` plus radius all return near-identical lists for Atlanta, Pittsburgh, and St. Louis. Qloo does not localize these types. So the desk:

- pulls one opener pool per plan (take 50, popularity capped at the headliner's),
- drops implausible picks: Qloo `start_year` 22 or more years back (legacy names) and `obscurity_scale` 1 to 2 (household names),
- puts acts whose Qloo birthplace or opening bio line names the stop city first, and says so ("Qloo bio names Chicago"),
- books no one twice while the pool lasts, and labels any repeat,
- runs `/v2/insights/compare` only for the lead opener per stop. The second opener shows its Qloo affinity.

## Time budget

`/api/plans` has `maxDuration = 60`. The agent runs under a 50 s deadline. Each Qloo call gets `min(15 s, time left minus 1 s)`; a 429 retry only happens if the wait plus another call still fits; past the deadline calls fail fast into Hold rooms and warn steps instead of hanging the route. Stops run in parallel with at most 3 Qloo requests in flight, and identical concurrent requests share one fetch. With a warm cache the demo plans finish in about 1 to 5 s.

## What live probing found

- `urn:heatmap` returns unnamed geohash cells; the desk snaps them to the nearest of 36 tour cities.
- `/v2/insights/compare` returns scored shared tags, no overlap number. Settlement uses the mean of the top five tag scores.
- Trends are not served on the hackathon host. Live mode hides momentum.
- Comedian coverage is thinner: some cities (Richmond) return no comedy rooms.
