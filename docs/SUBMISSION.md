# Advance submission

Filled against the official kit [docs/SUBMISSION.md](https://github.com/qloo/qloo-hackathon-kit/blob/main/docs/SUBMISSION.md) and the [developer guide](https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide).

## 1. Product problem statement

Independent musicians and comedians still sketch tours from habit. Advance takes a public act name, reads Qloo group-taste geography, and files a drivable run: cities, rooms, local openers, and a promo brief per stop. The user is a booker. There is no signup.

## 2. Qloo workflow or MCP tools used

Event surfaces: `qloo exec` and `qloo mcp` from `@qloo/qloo-harness`. Advance cites the nine official workflows and implements the matching product questions on the documented REST API from the Next.js server (`GET`, `X-Api-Key`, `https://hackathon.api.qloo.com`).

Adopted: `describe`, `where_popular`, `find_tags`, `recommend`, `rank`, `compare_audiences`, `entity_tags`, `trends`.

Not adopted: `audience_demographics` (tour routing does not need demographic inference).

Not spawned: `qloo exec` / `qloo mcp` as child processes. Serverless cannot host stdio MCP, mock mode must work without the harness, and parameter validation already lives in [`lib/qloo/validate.ts`](../lib/qloo/validate.ts). See [`lib/qloo/workflows.ts`](../lib/qloo/workflows.ts).

## 3. Redacted request-to-result

Inputs sent toward Qloo: public act name (search query) and city / region strings from our US city table or heatmap cells. Never emails, user names, device ids, or account ids.

Entity / tag choices:

- Act search types: `urn:entity:artist`, `urn:entity:person`.
- Geography: `filter.type=urn:entity:destination` + `output.heatmap.boundary=city` + location + act as `signal.interests.entities` ([Insights deep dive](https://docs.qloo.com/reference/insights-api-deep-dive)). `urn:heatmap` is not on the hackathon type list.
- Rooms: tag id from `/v2/tags` (`music venue` or `comedy club`), then `filter.type=urn:entity:place`. Tags are `urn:tag:` IDs, never free strings.
- Openers: `urn:entity:artist` for music, `urn:entity:person` for comedians, plus `/v2/insights/compare`.
- Promo: tags already on the act from `/entities`, plus podcast / place (bar tag id) / brand insights.

A walkthrough with a synthetic act is in the README, section 3.

## 4. Demo / screenshots

No credentials or personal data.

- [`docs/demo/landing.png`](demo/landing.png)
- [`docs/demo/plan.png`](demo/plan.png)

Judge path: three one-click tickets or a typed public act name. Mock mode. Atlas visible without map tiles.

## 5. Setup from a clean environment

```bash
npm install
cp .env.example .env.local
npm run dev
```

Leave `QLOO_MODE=mock`. Do not put a key in the repo or in any `NEXT_PUBLIC_*` variable. Full commands are in the README.

## 6. Known limitations

- Aggregate affinity only. Not a forecast of individual attendance or preference.
- Mock data is synthetic. Live coverage can be thin; rooms become Hold rather than invented.
- Room capacity is an estimate from popularity.
- `/v2/insights/compare` and `/trends/entity` degrade in place if the host returns an error.
- OpenRouter is optional and must not invent entities.

## Responsible data handling

- `QLOO_API_KEY` is read only in [`lib/qloo/live.ts`](../lib/qloo/live.ts) on the Node route. Leak test: [`tests/qloo-key-leak.test.ts`](../tests/qloo-key-leak.test.ts).
- Plan input is filtered by [`lib/qloo/signals.ts`](../lib/qloo/signals.ts) before any Qloo call.
- UI copy talks about crowds and cities, not what one person will do.
- Qloo responses are not committed. `.data/` is gitignored.
- Insights use documented parameters only. Invalid params are dropped by the allow-list. Legacy `/recommendations` is unused.
