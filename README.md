# Advance

A tour-routing desk for independent musicians and comedians. Type a public act name. The agent finds cities where that audience already lives (Qloo heatmaps), routes a drivable run, picks rooms that share the crowd, suggests local openers, and writes a promo brief for each stop.

Working title lives in [`lib/config.ts`](lib/config.ts) (`APP_NAME`). Override with `NEXT_PUBLIC_APP_NAME` if you rename it.

Built for the [Qloo Agentic Hackathon](https://qloo.devpost.com/) against the official kit ([qloo/qloo-hackathon-kit](https://github.com/qloo/qloo-hackathon-kit)). MIT licensed. Submission notes: [`docs/SUBMISSION.md`](docs/SUBMISSION.md).

## 1. Product problem

Bookers still guess the next city. Advance turns Qloo group-taste geography into a shareable run: cities first, then rooms, openers, and promo facts. Results describe where a crowd already clusters. They do not predict what any one person will do.

## 2. Qloo workflows used

The event supports `qloo exec` and `qloo mcp` from `@qloo/qloo-harness` (>= 0.1.26). Those surfaces expose nine workflows. Advance cites them and answers the same questions on the documented REST API (`GET` + `X-Api-Key` at `https://hackathon.api.qloo.com`) inside the Next.js server.

We do not spawn `qloo exec` or `qloo mcp` from the web app. A Vercel or serverless host cannot keep a stdio MCP process, the judge path must run in mock without a global harness, and our allow-list plus call budget live in TypeScript. Wrapping each step in a CLI subprocess would weaken the demo.

| Harness workflow | In Advance | Why it fits |
|---|---|---|
| `describe` | Yes | Resolve a public act name via `/search` + `/entities` |
| `where_popular` | Yes | City heatmaps via `filter.type=urn:entity:destination` + `output.heatmap.boundary=city` |
| `find_tags` | Yes | Music-venue / comedy-club tag ids from `/v2/tags` |
| `recommend` | Yes | Rooms, openers, podcasts, bars, brands for that crowd |
| `rank` | Yes | Affinity minus drive cost, nearest-neighbor + 2-opt |
| `compare_audiences` | Yes | Headliner vs opener overlap via `/v2/insights/compare` |
| `entity_tags` | Yes | Shared taste tags for promo briefs |
| `trends` | No (live) | `/trends/entity` answers 404 on the hackathon host, so live mode skips it and hides momentum. Mock mode still shows a synthetic figure. |
| `audience_demographics` | No | Geography and affinity are enough; demographic inference is out of scope |

Mapping source: [`lib/qloo/workflows.ts`](lib/qloo/workflows.ts). The desk radio prints the matching `qloo_*` label next to each REST path.

## 3. Request to result (redacted)

Example: MJ Lenderman, 8 shows, 5h drive cap, first Friday about eight weeks out.

1. `GET /search?query=MJ%20Lenderman&types=urn:entity:artist,urn:entity:person` then `GET /entities` → entity id (mock uses a synthetic UUID). Search always returns its closest hits, so Advance only routes an exact name match and otherwise answers "Did you mean".
2. `GET /v2/insights?filter.type=urn:heatmap&filter.location=POLYGON((-125 24, -66 24, -66 49.5, -125 49.5, -125 24))&signal.interests.entities=<id>` → one national grid of unnamed geohash cells. Each cell snaps to the nearest tour city within 40 miles; a city scores its best cell's affinity × popularity. One call keeps every city on the same scale. (`output.heatmap.boundary=city` answers 400 on the hackathon host, and free-text regions resolve unpredictably, so neither is used.)
3. Local rank under the drive cap → ordered stops (Pittsburgh → …).
4. Place insights in each city with a fixed tag (`urn:tag:category:place:live_music_venue` or `urn:tag:genre:place:comedy_club`) and the act as signal. Qloo has no capacity field, so room size comes only from Qloo tags (Intimate, Cozy, Concert hall, Performing arts theater) and reads "Size unknown" otherwise.
5. Artist or person insights capped at the headliner's popularity + `/v2/insights/compare` → opener shortlist. Overlap is the mean of the top five shared tag scores (compare returns no single overlap number).
6. Tag / podcast / place / brand insights → promo brief. Routing is ours, not Qloo.

No user name, email, device id, or account id is sent. Inputs are a public act name and optional start city. `.env.example` keeps `QLOO_API_KEY` empty. Live responses are cached only on the server (`.data/`, gitignored).

## 4. Demo

Judge path: open the app, click one of the three tickets, or type any name. No signup. First date defaults to about eight weeks out (a Friday). A map and stop list should land in well under 30 seconds in mock mode. The atlas draws the route even if map tiles are blocked.

Screenshots (synthetic acts, no credentials, no personal data):

- [Landing](docs/demo/landing.png)
- [Finished plan](docs/demo/plan.png)

## 5. Setup from a clean environment

Needs Node 22. The official harness, if you install it for local `qloo exec` experiments, wants 22.19.0+. Advance itself does not require the harness.

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
- Room size is an estimate from popularity, labeled as an estimate.
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
| `NEXT_PUBLIC_CONVEX_URL` | no | Optional hosted store; file store is the default |

Never commit keys. `.env*` is gitignored except `.env.example`. `QLOO_API_KEY` is read only in [`lib/qloo/live.ts`](lib/qloo/live.ts), which is imported from the Node route [`app/api/plans/route.ts`](app/api/plans/route.ts). A leak test fails if the name (or a set value) can reach a `"use client"` graph or `.next/static`.

## Mocked versus real

| Piece | Mock (`QLOO_MODE=mock`) | Live |
|---|---|---|
| Qloo entities, heatmaps, tags, compare, trends | Synthetic fixtures shaped like the documented schema. Not copies of Qloo data. | `https://hackathon.api.qloo.com` with `X-Api-Key` |
| Routing | Real algorithm, same in both modes | Same |
| Writing | Deterministic briefs if no OpenRouter key | OpenRouter if `OPENROUTER_API_KEY` is set |
| Share links | File store under `.data/plans` | Same, or Convex once configured |

The three example tickets name real public acts (MJ Lenderman, Sam Morril, Wednesday) so live mode resolves them through Qloo search. In mock mode their ids, cities, rooms, and openers are invented. Because the repository will be public, every mock fixture is hand-written in the repo. Do not paste live Qloo JSON into `lib/qloo/fixtures.ts` or anywhere else that is committed. Live responses are cached only under `.data/` (gitignored) on the server.

Invalid Qloo parameters fail silently with empty results. Every insights call is checked against a per-`filter.type` allow-list in [`lib/qloo/validate.ts`](lib/qloo/validate.ts) before it is sent.

## Architecture

- Next.js App Router on Vercel.
- One Qloo client: [`lib/qloo/client.ts`](lib/qloo/client.ts).
- Agent loop: [`lib/agent/run.ts`](lib/agent/run.ts). Same tools with or without a model key.
- Storage interface: [`lib/storage`](lib/storage). Convex schema is ready in [`convex/`](convex/); the app does not require a Convex deployment to demo.
- Map: offline CONUS SVG atlas always (route, numbered stops, city labels). MapLibre + OpenFreeMap tiles load on top when they are reachable.

## Open questions for live mode

- Which `output.heatmap.boundary` values return named cities in the hackathon environment?
- Exact tag IDs for music venues and comedy clubs (`npm run smoke` prints them).
- Whether `urn:entity:person` works for comedians in heatmap, place, and opener queries.
- Whether `/v2/insights/compare` and `/trends/*` respond, and with what payload shape.
- Coverage for smaller acts. The UI already says when a city is thin instead of inventing a room.
