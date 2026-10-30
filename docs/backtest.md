# Backtest: does the taste graph route like a booker?

`/proof` reports a hit-rate comparison between Settlement's ranking and a
biggest-metros list against real announced tour routing.

## Data

`data/backtest/tours.json` holds 30-50 real 2025-2026 North American headline
tours by club and theater acts and comedians. Each entry stores the act, its
kind (artist or person), the tour label, a source URL, and dated city stops
only. Cities are pre-mapped to the 36 Settlement markets (`lib/geo/cities.ts`),
so suburb venues land on their metro and stops outside the markets are dropped.
No raw Qloo responses are stored anywhere in this repo.

## Method (`scripts/backtest.ts`)

For each tour:

1. Collect the distinct real cities (already in "City, ST" form). K = that count.
2. Resolve the act's Qloo entity, pull its city heatmap, and score candidates
   with `scoreCities` (0.5 x normalized affinity + 0.5 x normalized lift vs the
   12-act reference panel mean - the same score the live router uses).
3. Take the top K cities. Hits = predicted cities that appear in the real routing.
4. Baseline: top K US cities by 2020 Census metro population. Same K, same scoring.
5. Combined (added second, after the first lift-vs-metros result was already
   measured): `combinedScores` = 0.5 x normalized metro population + 0.5 x the
   Qloo lift score over all 36 markets. The 50/50 weight (`COMBINED_WEIGHT` in
   `lib/scoring/lift.ts`) was declared before the combined run and was NOT
   tuned on these tours.

Order the work happened in: the lift-vs-metros comparison was run live first
(29 scored acts, 6 skipped), then the combined ranking was added as a second
method in response. The results file records `combinedWeight` so the declared
weight travels with the numbers.

Reported numbers: per-act hits/K per method, mean recall at K per method,
outright-winner counts (a method wins a tour only when its hits beat BOTH
others), ties, totals, and the skipped acts with their reasons. Since
predictions and reals are both K cities, precision and recall at K are equal;
the page reports the hit rate.

An LLM-only baseline is intentionally omitted: comparing against a paid model
would require spend, which is not allowed in this project. Acts with no
matching Qloo entity or no usable heatmap are skipped and listed in
`skipped`, not scored as misses.

## Reproduce

```
QLOO_MODE=live npx tsx scripts/backtest.ts
```

writes `data/backtest/results.json` (derived hit counts only). `/proof` reads
that committed file; it never calls Qloo at request time.

## Honest caveats

- "Where they played" is not pure taste. Bookers route where rooms, offers and
  drive legs exist, and those cluster in big metros, so the biggest-metros
  baseline is strong by construction.
- Small N. Routing is shaped by offers, holds and drive legs, not just taste.
- Only 36 markets are scored; real tours hit rooms this product cannot name.
- A miss where the real tour hit a room outside the 36 markets is excluded from K.
