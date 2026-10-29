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

Reported numbers: per-act hits/K, mean recall at K across tours, head-to-head
wins, and totals. Since predictions and reals are both K cities, precision and
recall at K are equal; the page reports the hit rate.

An LLM-only baseline is intentionally omitted: comparing against a paid model
would require spend, which is not allowed in this project.

## Reproduce

```
QLOO_MODE=live npx tsx scripts/backtest.ts
```

writes `data/backtest/results.json` (derived hit counts only). `/proof` reads
that committed file; it never calls Qloo at request time.

## Honest caveats

- Small N. Routing is shaped by offers, holds and drive legs, not just taste.
- Only 36 markets are scored; real tours hit rooms this product cannot name.
- A miss where the real tour hit a room outside the 36 markets is excluded from K.
