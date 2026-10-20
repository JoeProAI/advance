import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parsePlanRequest } from "@/lib/plan-request";
import { conusPathD, isInsideConusView, projectConus } from "@/lib/geo/atlas";
import { findCity } from "@/lib/geo/cities";
import {
  compareOverlap,
  listExampleActs,
  openersFor,
  resolveSyntheticAct,
  venuesFor,
  venueWhyLine,
} from "@/lib/qloo/fixtures";
import { defaultTourStartDate } from "@/lib/routing/plan";

describe("synthetic venues and openers", () => {
  it("varies venue names, kinds, and capacities across cities for one act", () => {
    const act = listExampleActs()[0]!;
    const rows = act.cityNames.map((city) => venuesFor(act, city)[0]!);
    const names = new Set(rows.map((row) => row.name));
    const caps = new Set(rows.map((row) => row.capacity));
    expect(names.size).toBe(rows.length);
    expect(caps.size).toBeGreaterThan(1);
    expect(rows.every((row) => row.name.includes("The Parish"))).toBe(false);
  });

  it("gives a musician and a comedian different rooms in the same city", () => {
    const band = listExampleActs()[0]!;
    const comic = listExampleActs()[1]!;
    expect(venuesFor(band, "Chicago")[0]!.name).not.toBe(venuesFor(comic, "Chicago")[0]!.name);
    expect(venuesFor(band, "Chicago")[0]!.kind).not.toBe(venuesFor(comic, "Chicago")[0]!.kind);
  });

  it("varies openers per city and per act", () => {
    const band = listExampleActs()[0]!;
    const comic = listExampleActs()[1]!;
    const bandA = openersFor(band, "Nashville").map((row) => row.name).join("|");
    const bandB = openersFor(band, "Chicago").map((row) => row.name).join("|");
    const comicA = openersFor(comic, "Boston").map((row) => row.name).join("|");
    expect(bandA).not.toBe(bandB);
    expect(bandA).not.toBe(comicA);
    const pairs = band.cityNames.map((city) => openersFor(band, city).map((row) => row.name).join("|"));
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it("builds a why line from that stop's affinity, tags, and capacity", () => {
    const act = listExampleActs()[0]!;
    const nashville = venuesFor(act, "Nashville")[0]!;
    const chicago = venuesFor(act, "Chicago")[0]!;
    const whyA = venueWhyLine({
      actName: act.name,
      city: "Nashville",
      affinity: 0.91,
      kind: nashville.kind,
      capacity: nashville.capacity,
      tags: nashville.tags,
    });
    const whyB = venueWhyLine({
      actName: act.name,
      city: "Chicago",
      affinity: 0.77,
      kind: chicago.kind,
      capacity: chicago.capacity,
      tags: chicago.tags,
    });
    expect(whyA).toContain("Nashville");
    expect(whyA).toContain(`${nashville.capacity} cap`);
    expect(whyA).toContain("aff 0.91");
    expect(whyA).not.toBe(whyB);
    expect(whyA).not.toBe("overlap 0.80");
  });

  it("hashes compare overlap so two pairs are not identical", () => {
    const a = compareOverlap("act-1", "opener-nashville");
    const b = compareOverlap("act-1", "opener-chicago");
    expect(a).not.toBe(b);
    expect(a).toBeGreaterThanOrEqual(0.48);
    expect(a).toBeLessThanOrEqual(0.89);
  });

  it("still invents a distinct book for a typed-in act", () => {
    const act = resolveSyntheticAct("Ada Wren Trio");
    const cities = act.cityNames.slice(0, 4);
    const names = cities.map((city) => venuesFor(act, city)[0]!.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("parsePlanRequest start date", () => {
  it("fills the eight-week default when the field is blank", () => {
    const request = parsePlanRequest({ actName: "Marlow & the Night Shifts" });
    expect(request.startDate).toBe(defaultTourStartDate());
  });

  it("keeps an explicit date", () => {
    const request = parsePlanRequest({
      actName: "Rina Voss",
      startDate: "2027-02-12",
    });
    expect(request.startDate).toBe("2027-02-12");
  });
});

describe("offline CONUS atlas", () => {
  it("projects major cities inside the view", () => {
    for (const name of ["Nashville", "Chicago", "Boston", "Seattle", "Austin"]) {
      const city = findCity(name);
      expect(city).toBeTruthy();
      expect(isInsideConusView(city!.lon, city!.lat)).toBe(true);
      const point = projectConus(city!.lon, city!.lat);
      expect(point.x).toBeGreaterThan(20);
      expect(point.x).toBeLessThan(780);
    }
  });

  it("keeps the west coast left of the east coast", () => {
    const seattle = projectConus(-122.3321, 47.6062);
    const boston = projectConus(-71.0589, 42.3601);
    expect(seattle.x).toBeLessThan(boston.x);
  });

  it("emits a real CONUS path the atlas can draw without tiles", () => {
    const path = conusPathD();
    expect(path.startsWith("M")).toBe(true);
    expect(path.length).toBeGreaterThan(200);
    expect(path).toContain(" Z");
  });
});

describe("public-repo mock fixtures", () => {
  it("marks fixtures as hand-written, not copied from Qloo", () => {
    const source = readFileSync("lib/qloo/fixtures.ts", "utf8");
    expect(source).toMatch(/Hand-written synthetic/);
    expect(source).toMatch(/Not copied from Qloo/);
    const readme = readFileSync("README.md", "utf8");
    expect(readme).toMatch(/hand-written/);
    expect(readme).toMatch(/This repo will be public/);
  });
});
