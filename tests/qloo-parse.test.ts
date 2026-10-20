import { describe, expect, it } from "vitest";
import { pickByTier, roomSize } from "@/lib/agent/rooms";
import { findCity } from "@/lib/geo/cities";
import {
  cellsToCities,
  dedupeMarkets,
  entityKind,
  entityTags,
  explainScore,
  matchSearchHit,
  overlapFromCompare,
  parseEntityList,
  parseHeatmapCells,
  withinMiles,
} from "@/lib/qloo/parse";
import type { QlooEntity, QlooHeatmapCell } from "@/lib/qloo/types";

// Hand-shaped synthetic payloads in the live response layout. Not Qloo data.
const searchPayload = {
  results: [
    {
      name: "Test Band",
      entity_id: "00000000-9999-4000-8000-000000000001",
      types: ["urn:entity:artist"],
      popularity: 0.8,
      tags: [{ tag_id: "urn:tag:genre:music:test", name: "Test Rock", type: "urn:tag:genre:music" }],
      properties: { short_description: "Synthetic test act." },
    },
    { name: "No Id" },
  ],
};

function cell(lat: number, lon: number, affinity: number, popularity: number): QlooHeatmapCell {
  return {
    location: { latitude: lat, longitude: lon, geohash: "syn" },
    query: { affinity, affinity_rank: 0.5, popularity },
  };
}

describe("live response parsing", () => {
  it("reads a plain results array from /search and /entities", () => {
    const parsed = parseEntityList(searchPayload);
    expect(parsed.results.entities).toHaveLength(1);
    const hit = parsed.results.entities[0]!;
    expect(hit.name).toBe("Test Band");
    expect(entityKind(hit, "person")).toBe("artist");
    expect(entityTags(hit)[0]?.name).toBe("Test Rock");
  });

  it("still reads results.entities from /v2/insights", () => {
    const parsed = parseEntityList({
      success: true,
      results: { entities: [{ name: "Room", entity_id: "r1", type: "urn:entity", subtype: "urn:entity:place" }] },
    });
    expect(parsed.results.entities.map((e) => e.name)).toEqual(["Room"]);
    expect(parseEntityList(null).results.entities).toEqual([]);
    expect(parseEntityList({ results: "nope" }).results.entities).toEqual([]);
  });

  it("keeps only well-formed heatmap cells", () => {
    const cells = parseHeatmapCells({
      results: { heatmap: [cell(41.9, -87.6, 1, 0.9), { location: { latitude: 1 }, query: {} }] },
    });
    expect(cells).toHaveLength(1);
    expect(parseHeatmapCells({ results: { entities: [] } })).toEqual([]);
  });

  it("reads the explainability score for the act signal", () => {
    const entity: QlooEntity = {
      name: "Room",
      entity_id: "r1",
      query: {
        affinity: 0.9,
        explainability: {
          "signal.interests.entities": [
            { entity_id: "other", score: 0.2 },
            { entity_id: "act", score: 0.7 },
          ],
        },
      },
    };
    expect(explainScore(entity, "act")).toBe(0.7);
    expect(explainScore(entity)).toBe(0.2);
    expect(explainScore({ name: "x", entity_id: "y" })).toBeUndefined();
  });
});

describe("heatmap cells to cities", () => {
  it("snaps unnamed cells to the nearest tour city and ranks by affinity × popularity", () => {
    const chicago = findCity("Chicago")!;
    const nashville = findCity("Nashville")!;
    const cities = cellsToCities([
      cell(chicago.lat + 0.1, chicago.lon - 0.1, 0.9, 0.95),
      cell(chicago.lat - 0.2, chicago.lon, 1, 0.3),
      cell(nashville.lat, nashville.lon + 0.05, 1, 0.6),
      // Rural cell with saturated affinity, far from any tour city.
      cell(44.1, -103.2, 1, 0.04),
    ]);
    expect(cities.map((city) => city.name)).toEqual(["Chicago", "Nashville"]);
    expect(cities[0]!.affinity).toBeCloseTo(0.855, 3);
    expect(cities[0]!.lat).toBe(chicago.lat);
    expect(cities[1]!.affinity).toBeCloseTo(0.6, 3);
  });

  it("drops cells outside the radius", () => {
    expect(cellsToCities([cell(44.1, -103.2, 1, 1)])).toEqual([]);
  });
});

describe("venue market check", () => {
  it("keeps rooms near the city and drops ones from a same-name city elsewhere", () => {
    const richmond = findCity("Richmond")!;
    expect(withinMiles({ name: "a", entity_id: "a", location: { lat: 37.55, lon: -77.45 } }, richmond, 30)).toBe(true);
    expect(withinMiles({ name: "b", entity_id: "b", location: { lat: 37.94, lon: -122.35 } }, richmond, 30)).toBe(false);
    expect(withinMiles({ name: "c", entity_id: "c" }, richmond, 30)).toBe(true);
  });
});

describe("one city per market", () => {
  it("drops Brooklyn when New York already scored higher", () => {
    const ny = { ...findCity("New York")!, affinity: 0.98, affinityRank: 0.9, popularity: 1 };
    const bk = { ...findCity("Brooklyn")!, affinity: 0.97, affinityRank: 0.9, popularity: 1 };
    const philly = { ...findCity("Philadelphia")!, affinity: 0.9, affinityRank: 0.9, popularity: 1 };
    expect(dedupeMarkets([ny, bk, philly]).map((city) => city.name)).toEqual(["New York", "Philadelphia"]);
  });
});

describe("compare overlap", () => {
  it("averages the top five shared tag scores", () => {
    const result = overlapFromCompare({
      results: {
        tags: [0.9, 0.8, 0.7, 0.6, 0.5, 0.1].map((score, i) => ({
          tag_id: `urn:tag:test:${i}`,
          name: `Tag ${i}`,
          query: { score },
        })),
      },
    });
    expect(result.overlap).toBeCloseTo(0.7, 5);
    expect(result.shared_tags).toEqual(["Tag 0", "Tag 1", "Tag 2", "Tag 3", "Tag 4"]);
  });

  it("returns 0 when compare shares nothing", () => {
    expect(overlapFromCompare({ results: { tags: [] } }).overlap).toBe(0);
    expect(overlapFromCompare({}).overlap).toBe(0);
  });
});

describe("did-you-mean search guard", () => {
  const hits: QlooEntity[] = [
    { name: "MJ Lenderman", entity_id: "a" },
    { name: "Lenderman Tribute", entity_id: "b" },
  ];

  it("routes an exact name, ignoring case, accents, punctuation, and a leading The", () => {
    expect(matchSearchHit("mj lenderman", hits)).toMatchObject({ ok: true, entity: { entity_id: "a" } });
    expect(matchSearchHit("M.J. Lenderman", [{ name: "MJ Lenderman", entity_id: "a" }]).ok).toBe(true);
    expect(matchSearchHit("Beatles", [{ name: "The Beatles", entity_id: "c" }]).ok).toBe(true);
    expect(matchSearchHit("Beyonce", [{ name: "Beyoncé", entity_id: "d" }]).ok).toBe(true);
  });

  it("refuses a near miss and offers suggestions", () => {
    const result = matchSearchHit("Lenderman", hits);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.suggestions).toEqual(["MJ Lenderman", "Lenderman Tribute"]);
    }
    expect(matchSearchHit("anything", [])).toEqual({ ok: false, suggestions: [] });
  });
});

describe("room sizing from Qloo tags", () => {
  const tagged = (names: string[], price?: number): QlooEntity => ({
    name: "Room",
    entity_id: names.join("-") || "none",
    tags: names.map((name) => ({ id: `urn:tag:test:${name}`, name })),
    properties: price ? { price_level: price } : {},
  });

  it("labels small rooms, theaters, and unknowns without inventing capacity", () => {
    expect(roomSize(tagged(["Intimate"])).size).toBe("small");
    expect(roomSize(tagged(["Concert hall", "Intimate"])).size).toBe("theater");
    expect(roomSize(tagged(["Night club"])).size).toBe("club");
    const unknown = roomSize(tagged(["Lively"], 2));
    expect(unknown.size).toBe("unknown");
    expect(unknown.label).toMatch(/^Size unknown/);
    expect(unknown.label).toContain("Price level 2 of 4");
    for (const label of [roomSize(tagged(["Intimate"])).label, unknown.label]) {
      expect(label).not.toMatch(/\d+\s*(cap|–)/);
    }
  });

  it("lets the budget tier pull the wanted room size forward", () => {
    const rooms = [tagged(["Concert hall"]), tagged(["Intimate"]), tagged([])];
    expect(pickByTier(rooms, "either")).toBe(rooms[0]);
    expect(pickByTier(rooms, "rooms")).toBe(rooms[1]);
    expect(pickByTier(rooms, "theaters")).toBe(rooms[0]);
    expect(pickByTier([tagged([])], "rooms")).toBeDefined();
    expect(pickByTier([], "rooms")).toBeUndefined();
  });
});
