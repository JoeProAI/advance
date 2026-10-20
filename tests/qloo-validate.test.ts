import { describe, expect, it } from "vitest";
import { allowedParamsFor, validateInsightsParams } from "@/lib/qloo/validate";
import { createQlooClient } from "@/lib/qloo/client";
import { isInsightType } from "@/lib/qloo/validate";
import { cityHeatmapParams } from "@/lib/qloo/request";
import { cellsToCities } from "@/lib/qloo/parse";

describe("validateInsightsParams", () => {
  it("rejects a missing or unknown filter.type", () => {
    const missing = validateInsightsParams({ take: 10 });
    expect(missing.ok).toBe(false);
    expect(missing.errors[0]).toMatch(/filter\.type/);

    const bad = validateInsightsParams({ "filter.type": "urn:entity:comedian" });
    expect(bad.ok).toBe(false);

    const heatmapType = validateInsightsParams({ "filter.type": "urn:heatmap" });
    expect(heatmapType.ok).toBe(false);
    expect(isInsightType("urn:heatmap")).toBe(true);
    expect(isInsightType("urn:tag")).toBe(false);
  });

  it("requires location and a signal for urn:heatmap", () => {
    const noLocation = validateInsightsParams({
      "filter.type": "urn:heatmap",
      "signal.interests.entities": "abc",
    });
    expect(noLocation.ok).toBe(false);
    expect(noLocation.errors.join(" ")).toMatch(/filter\.location/);

    const noSignal = validateInsightsParams({
      "filter.type": "urn:heatmap",
      "filter.location": "POLYGON((-97 37, -80 37, -80 49, -97 49, -97 37))",
    });
    expect(noSignal.ok).toBe(false);

    const ok = validateInsightsParams(cityHeatmapParams({ entityId: "00000000-1111-4000-8000-000000000001" }));
    expect(ok.ok).toBe(true);
    expect(ok.params["filter.type"]).toBe("urn:heatmap");
    expect(ok.params["filter.location"]).toMatch(/^POLYGON/);
  });

  it("drops output.heatmap.boundary, which the hackathon host rejects as city", () => {
    const result = validateInsightsParams({
      "filter.type": "urn:heatmap",
      "filter.location": "POLYGON((-97 37, -80 37, -80 49, -97 49, -97 37))",
      "signal.interests.entities": "abc",
      "output.heatmap.boundary": "city",
    });
    expect(result.ok).toBe(true);
    expect(result.dropped).toContain("output.heatmap.boundary");
    expect(result.params["output.heatmap.boundary"]).toBeUndefined();
  });

  it("drops parameters that do not belong to the entity type", () => {
    const result = validateInsightsParams({
      "filter.type": "urn:entity:artist",
      "signal.interests.entities": "abc",
      "filter.release_year.min": 2020,
      "filter.hotel_class.min": 3,
      take: 10,
    });
    expect(result.ok).toBe(true);
    expect(result.dropped).toContain("filter.release_year.min");
    expect(result.dropped).toContain("filter.hotel_class.min");
    expect(result.params["filter.release_year.min"]).toBeUndefined();
  });

  it("drops free-string tags and keeps /v2/tags ids", () => {
    const dropped = validateInsightsParams({
      "filter.type": "urn:entity:place",
      "filter.tags": "music venue",
      "filter.location.query": "Chicago",
      "signal.interests.entities": "abc",
    });
    expect(dropped.ok).toBe(true);
    expect(dropped.dropped).toContain("filter.tags");

    const kept = validateInsightsParams({
      "filter.type": "urn:entity:place",
      "filter.tags": "urn:tag:genre:place:music_venue",
      "filter.location.query": "Chicago",
      "signal.interests.entities": "abc",
    });
    expect(kept.ok).toBe(true);
    expect(kept.params["filter.tags"]).toBe("urn:tag:genre:place:music_venue");
  });

  it("allows place location filters and explainability", () => {
    const result = validateInsightsParams({
      "filter.type": "urn:entity:place",
      "filter.tags": "urn:tag:genre:place:music_venue",
      "filter.location.query": "Denver",
      "signal.interests.entities": "abc",
      "feature.explainability": true,
      "filter.popularity.max": 0.5,
      take: 8,
    });
    expect(result.ok).toBe(true);
    expect(result.params["feature.explainability"]).toBe("true");
  });

  it("caps take at 50", () => {
    const result = validateInsightsParams({
      "filter.type": "urn:entity:brand",
      "signal.interests.entities": "abc",
      take: 200,
    });
    expect(result.ok).toBe(true);
    expect(result.params.take).toBe("50");
  });
});

describe("allow-lists", () => {
  it("keeps WKT location on urn:heatmap and no boundary output anywhere", () => {
    expect(allowedParamsFor("urn:heatmap")).toContain("filter.location");
    expect(allowedParamsFor("urn:heatmap")).not.toContain("output.heatmap.boundary");
    expect(allowedParamsFor("urn:entity:destination")).not.toContain("output.heatmap.boundary");
    expect(allowedParamsFor("urn:entity:place")).not.toContain("output.heatmap.boundary");
    expect(isInsightType("urn:entity:person")).toBe(true);
    expect(isInsightType("urn:entity:comedian")).toBe(false);
  });
});

describe("mock client contract", () => {
  it("returns unnamed heatmap cells that map onto tour cities", async () => {
    const client = createQlooClient("mock");
    const search = await client.search({ query: "MJ Lenderman", take: 1 });
    const entityId = search.results.entities[0]?.entity_id;
    expect(entityId).toBeTruthy();
    const heat = await client.insights(cityHeatmapParams({ entityId: entityId! }));
    expect("heatmap" in heat.results).toBe(true);
    if ("heatmap" in heat.results) {
      expect(heat.results.heatmap.length).toBeGreaterThan(0);
      expect("name" in heat.results.heatmap[0]!.location).toBe(false);
      expect(cellsToCities(heat.results.heatmap).length).toBeGreaterThan(5);
    }
  });

  it("returns an empty 200 for a city with no fixture coverage", async () => {
    const client = createQlooClient("mock");
    const search = await client.search({ query: "MJ Lenderman", take: 1 });
    const empty = await client.insights({
      "filter.type": "urn:entity:place",
      "filter.location.query": "Nome",
      "signal.interests.entities": search.results.entities[0]?.entity_id,
      take: 8,
    });
    expect("entities" in empty.results).toBe(true);
    if ("entities" in empty.results) {
      expect(empty.results.entities).toEqual([]);
    }
  });

  it("resolves a typed act that is not an example", async () => {
    const client = createQlooClient("mock");
    const search = await client.search({ query: "Ada Wren Trio", types: "urn:entity:artist" });
    expect(search.results.entities[0]?.name).toBe("Ada Wren Trio");
  });

  it("refuses a heatmap without a location before calling", async () => {
    const client = createQlooClient("mock");
    await expect(
      client.insights({
        "filter.type": "urn:heatmap",
        "signal.interests.entities": "abc",
      }),
    ).rejects.toThrow(/filter\.location/);
  });
});
