# Backtest tour data

`tours.json` holds real announced-or-played 2025-2026 North American headline
tours by club/theater-level artists and comedians. It is used to backtest
routing/scoring logic against tours that actually happened.

Each entry is `{ act, kind, tour, source, dates }`:

- `kind` is `"artist"` for musical acts and `"person"` for comedians.
- `tour` is the tour/leg name; multiple legs of one act are separate entries.
- `source` is a real URL where the routing was published.
- `dates` is a list of `{ date, city }` pairs — store only cities and dates.

City normalization: every `city` is one of the 36 markets in
`lib/geo/cities.ts`, written as `"City, ST"`. Dates in suburbs or nearby towns
are remapped to the nearest market (e.g. Oakland -> San Francisco, CA;
St. Paul -> Minneapolis, MN). Dates that cannot reasonably map to a market are
dropped, as are non-North-American and festival-only stops.
