import { describe, expect, it } from "vitest";
import { buildBaseline, scoreCities } from "@/lib/scoring/lift";
import { buildCityBoard } from "@/lib/agent/run";
import type { CandidateCity } from "@/lib/types";

function city(name: string, region: string, affinity: number, lat = 40, lon = -80): CandidateCity {
  return { name, region, country: "US", lat, lon, affinity, affinityRank: 1, popularity: 1 };
}

describe("scoreCities", () => {
  it("ranks a city the act over-indexes on above a big-metro tie", () => {
    const baseline = buildBaseline([
      { name: "panel", cities: [city("New York", "NY", 0.9), city("Asheville", "NC", 0.1)] },
    ]);
    const scored = scoreCities([city("New York", "NY", 0.9), city("Asheville", "NC", 0.95)], baseline);
    const nyc = scored.find((c) => c.name === "New York")!;
    const avl = scored.find((c) => c.name === "Asheville")!;
    expect(nyc.lift).toBeCloseTo(0, 5);
    expect(avl.lift).toBeCloseTo(0.85, 5);
    expect(avl.score).toBeGreaterThan(nyc.score);
    expect(scored[0]!.name).toBe("Asheville");
  });

  it("falls back to normalized affinity with no baseline and lift 0", () => {
    const scored = scoreCities([city("A", "AA", 0.5), city("B", "BB", 0.9)], null);
    expect(scored[0]!.name).toBe("B");
    expect(scored[0]!.lift).toBe(0);
  });
});

describe("buildCityBoard", () => {
  it("labels routed, swapped, drive-cut and outscored cities", () => {
    const scored = scoreCities(
      [
        city("Chicago", "IL", 0.95, 41.8781, -87.6298),
        city("Milwaukee", "WI", 0.9, 43.0389, -87.9065),
        city("Madison", "WI", 0.85, 43.0731, -89.4012),
        city("Seattle", "WA", 0.8, 47.6062, -122.3321),
      ],
      null,
    );
    const board = buildCityBoard({
      scored,
      routed: scored.filter((c) => c.name === "Chicago"),
      swaps: [{ city: "Milwaukee, WI", reason: "only unusable rooms came back" }],
      maxDriveHours: 4,
      take: 4,
    });
    expect(board.find((r) => r.name === "Chicago")!.note).toBe("on the run");
    expect(board.find((r) => r.name === "Milwaukee")!.note).toMatch(/^swapped out:/);
    expect(board.find((r) => r.name === "Seattle")!.note).toMatch(/^cut: .*h from the nearest stop, cap is 4h$/);
    expect(board.find((r) => r.name === "Madison")!.note).toBe("scored below the cities on this run");
  });
});
