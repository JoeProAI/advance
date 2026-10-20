import { describe, expect, it } from "vitest";
import type { CandidateCity } from "@/lib/types";
import {
  assignDates,
  defaultTourStartDate,
  driveHours,
  haversineMiles,
  nearestNeighborOrder,
  nextFriday,
  selectAndRoute,
  snapToFriday,
  twoOpt,
} from "@/lib/routing/plan";

const nyc: CandidateCity = {
  name: "New York",
  region: "NY",
  country: "US",
  lat: 40.7128,
  lon: -74.006,
  affinity: 0.9,
  affinityRank: 0.9,
  popularity: 0.8,
};
const philadelphia: CandidateCity = {
  name: "Philadelphia",
  region: "PA",
  country: "US",
  lat: 39.9526,
  lon: -75.1652,
  affinity: 0.8,
  affinityRank: 0.8,
  popularity: 0.7,
};
const chicago: CandidateCity = {
  name: "Chicago",
  region: "IL",
  country: "US",
  lat: 41.8781,
  lon: -87.6298,
  affinity: 0.85,
  affinityRank: 0.85,
  popularity: 0.75,
};
const denver: CandidateCity = {
  name: "Denver",
  region: "CO",
  country: "US",
  lat: 39.7392,
  lon: -104.9903,
  affinity: 0.7,
  affinityRank: 0.7,
  popularity: 0.6,
};
const la: CandidateCity = {
  name: "Los Angeles",
  region: "CA",
  country: "US",
  lat: 34.0522,
  lon: -118.2437,
  affinity: 0.6,
  affinityRank: 0.6,
  popularity: 0.9,
};

function pathMiles(order: number[], cities: CandidateCity[]): number {
  let total = 0;
  for (let i = 1; i < order.length; i += 1) {
    total += haversineMiles(cities[order[i - 1]!]!, cities[order[i]!]!);
  }
  return total;
}

describe("haversineMiles", () => {
  it("measures New York to Los Angeles near 2450 miles", () => {
    const miles = haversineMiles(nyc, la);
    expect(miles).toBeGreaterThan(2400);
    expect(miles).toBeLessThan(2550);
  });

  it("is symmetric and zero on the same point", () => {
    expect(haversineMiles(nyc, nyc)).toBeCloseTo(0, 5);
    expect(haversineMiles(nyc, chicago)).toBeCloseTo(haversineMiles(chicago, nyc), 6);
  });
});

describe("driveHours", () => {
  it("divides miles by cruise speed", () => {
    expect(driveHours(250, 50)).toBe(5);
  });

  it("rejects a non-positive speed", () => {
    expect(() => driveHours(10, 0)).toThrow(/positive/);
  });
});

describe("nearestNeighbor + 2-opt", () => {
  it("visits every city once", () => {
    const cities = [nyc, chicago, denver, la, philadelphia];
    const order = nearestNeighborOrder(cities, 0);
    expect(new Set(order).size).toBe(cities.length);
  });

  it("does not lengthen a crossed path", () => {
    const cities = [nyc, denver, philadelphia, chicago];
    const naive = [0, 1, 2, 3];
    const improved = twoOpt(naive, cities);
    expect(pathMiles(improved, cities)).toBeLessThanOrEqual(pathMiles(naive, cities) + 0.01);
  });
});

describe("selectAndRoute", () => {
  it("keeps hops under the drive cap when a tight corridor exists", () => {
    const corridor: CandidateCity[] = [
      { ...nyc, affinity: 0.99 },
      { ...philadelphia, affinity: 0.9 },
      {
        name: "Baltimore",
        region: "MD",
        country: "US",
        lat: 39.2904,
        lon: -76.6122,
        affinity: 0.88,
        affinityRank: 0.88,
        popularity: 0.6,
      },
      {
        name: "Washington",
        region: "DC",
        country: "US",
        lat: 38.9072,
        lon: -77.0369,
        affinity: 0.86,
        affinityRank: 0.86,
        popularity: 0.7,
      },
    ];
    const route = selectAndRoute({
      candidates: corridor,
      showCount: 4,
      maxDriveHours: 4,
    });
    expect(route.cities.length).toBeGreaterThanOrEqual(3);
    for (const city of route.cities.slice(1)) {
      expect(city.driveHoursFromPrev).toBeLessThanOrEqual(4.05);
    }
  });

  it("starts at the home city when that city is a candidate", () => {
    const route = selectAndRoute({
      candidates: [chicago, nyc, philadelphia],
      showCount: 3,
      maxDriveHours: 12,
      homeCity: nyc,
    });
    expect(route.cities[0]?.name).toBe("New York");
  });

  it("drops an unreachable coast when the drive cap is tight", () => {
    const route = selectAndRoute({
      candidates: [nyc, philadelphia, la],
      showCount: 3,
      maxDriveHours: 5,
    });
    expect(route.cities.some((city) => city.name === "Los Angeles")).toBe(false);
    expect(route.cities.length).toBeGreaterThanOrEqual(2);
  });
});

describe("assignDates", () => {
  it("inserts a rest day every third show", () => {
    const dates = assignDates(4, "2026-10-16");
    expect(dates[0]).toBe("2026-10-16");
    expect(dates[1]).toBe("2026-10-17");
    expect(dates[2]).toBe("2026-10-18");
    expect(dates[3]).toBe("2026-10-20");
  });

  it("rejects a bad start date", () => {
    expect(() => assignDates(2, "friday")).toThrow(/YYYY-MM-DD/);
  });
});

describe("nextFriday", () => {
  it("returns the following Friday from a Monday", () => {
    const friday = nextFriday(new Date("2026-10-12T12:00:00Z"));
    expect(friday.toISOString().slice(0, 10)).toBe("2026-10-16");
  });
});

describe("defaultTourStartDate", () => {
  it("lands about eight weeks out on a Friday", () => {
    expect(defaultTourStartDate(new Date("2026-10-08T12:00:00Z"))).toBe("2026-12-04");
  });

  it("keeps a Friday that already lands on the booking window", () => {
    const from = new Date("2026-10-16T12:00:00Z");
    const start = defaultTourStartDate(from);
    expect(new Date(`${start}T12:00:00Z`).getUTCDay()).toBe(5);
    expect(snapToFriday(new Date("2026-12-04T12:00:00Z")).toISOString().slice(0, 10)).toBe(
      "2026-12-04",
    );
  });

  it("is used when assignDates has no explicit start", () => {
    const dates = assignDates(2, defaultTourStartDate(new Date("2026-10-08T12:00:00Z")));
    expect(dates[0]).toBe("2026-12-04");
    expect(dates[1]).toBe("2026-12-05");
  });
});
