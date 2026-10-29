import { describe, expect, it } from "vitest";
import { routeWithoutQloo } from "@/lib/scoring/without-qloo";
import { driveHours, haversineMiles } from "@/lib/routing/plan";

describe("routeWithoutQloo", () => {
  it("routes the biggest metros with no client and respects the drive cap", () => {
    const maxDriveHours = 6;
    const route = routeWithoutQloo({
      showCount: 8,
      maxDriveHours,
      qlooStops: [{ name: "New York", region: "NY" }],
    });
    expect(route.cities.length).toBe(8);
    // Legs between consecutive stops never exceed the cap.
    for (let i = 1; i < route.cities.length; i += 1) {
      const hours = driveHours(haversineMiles(route.cities[i - 1]!, route.cities[i]!));
      expect(hours).toBeLessThanOrEqual(maxDriveHours);
    }
    // Sorted biggest-first candidates only: every city must be a major metro.
    for (const city of route.cities) {
      expect(city.metroMillions).toBeGreaterThan(0.5);
    }
    expect(route.shared).toContain("New York, NY");
  });

  it("marks only genuinely shared cities as shared", () => {
    const route = routeWithoutQloo({
      showCount: 4,
      maxDriveHours: 8,
      qlooStops: [
        { name: "Marfa", region: "TX" },
        { name: routeWithoutQloo({ showCount: 1, maxDriveHours: 8, qlooStops: [] }).cities[0]!.name, region: routeWithoutQloo({ showCount: 1, maxDriveHours: 8, qlooStops: [] }).cities[0]!.region },
      ],
    });
    expect(route.shared).toHaveLength(1);
  });
});
