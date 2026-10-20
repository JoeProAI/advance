import { describe, expect, it } from "vitest";
import { QLOO_HACKATHON_HOST } from "@/lib/config";
import { CONUS_WKT } from "@/lib/geo/cities";
import {
  HACKATHON_INSIGHT_TYPES,
  PLACE_TAGS,
  buildQlooRequest,
  cityHeatmapParams,
  qlooHeaders,
} from "@/lib/qloo/request";

const KEY = "test-hackathon-key";

describe("Qloo request builder (hackathon guide points 1–4)", () => {
  it("uses exactly https://hackathon.api.qloo.com and appends a path", () => {
    const built = buildQlooRequest({
      path: "/v2/insights",
      params: { "filter.type": "urn:entity:place" },
      apiKey: KEY,
    });
    expect(QLOO_HACKATHON_HOST).toBe("https://hackathon.api.qloo.com");
    expect(built.url.startsWith("https://hackathon.api.qloo.com/")).toBe(true);
    expect(built.url.startsWith("https://hackathon.api.qloo.com?")).toBe(false);
    expect(built.path).toBe("/v2/insights");
    expect(() => buildQlooRequest({ path: "/", apiKey: KEY })).toThrow(/path/);
    expect(() =>
      buildQlooRequest({ path: "/v2/insights", apiKey: KEY, baseUrl: "https://api.qloo.com" }),
    ).toThrow(/hackathon\.api\.qloo\.com/);
  });

  it("puts the key in X-Api-Key, not Bearer and not the query string", () => {
    const built = buildQlooRequest({
      path: "/search",
      params: { query: "MJ Lenderman" },
      apiKey: KEY,
    });
    expect(built.headers["X-Api-Key"]).toBe(KEY);
    expect(built.headers.Accept).toBe("application/json");
    expect(built.url).not.toMatch(/[?&](api[_-]?key|key)=/i);
    expect(JSON.stringify(built.headers)).not.toMatch(/Bearer/i);
    expect(qlooHeaders(KEY)["X-Api-Key"]).toBe(KEY);
  });

  it("builds /v2/insights as GET with query-string params", () => {
    const built = buildQlooRequest({
      path: "/v2/insights",
      params: {
        "filter.type": "urn:entity:destination",
        "filter.location.query": "Midwest United States",
        "output.heatmap.boundary": "city",
      },
      apiKey: KEY,
    });
    expect(built.method).toBe("GET");
    const url = new URL(built.url);
    expect(url.pathname).toBe("/v2/insights");
    expect(url.searchParams.get("filter.type")).toBe("urn:entity:destination");
    expect(url.searchParams.get("output.heatmap.boundary")).toBe("city");
    expect(built.url).not.toContain("{");
  });

  it("requests the fan heatmap as urn:heatmap over a CONUS WKT polygon, no boundary", () => {
    const params = cityHeatmapParams({ entityId: "00000000-1111-4000-8000-000000000001" });
    expect(params["filter.type"]).toBe("urn:heatmap");
    expect(HACKATHON_INSIGHT_TYPES).toContain(params["filter.type"]);
    expect(String(params["filter.location"])).toMatch(/^POLYGON\(\(/);
    expect(params["filter.location"]).toBe(CONUS_WKT);
    expect(params["output.heatmap.boundary"]).toBeUndefined();
    expect(params["filter.location.query"]).toBeUndefined();
    expect(params["signal.interests.entities"]).toBe("00000000-1111-4000-8000-000000000001");

    const built = buildQlooRequest({
      path: "/v2/insights",
      params: Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
      apiKey: KEY,
    });
    const url = new URL(built.url);
    expect(url.searchParams.get("filter.type")).toBe("urn:heatmap");
    expect(url.searchParams.get("filter.location")).toBe(CONUS_WKT);
    expect(built.url).not.toContain("output.heatmap.boundary");
  });

  it("takes a regional WKT box when given one", () => {
    const wkt = "POLYGON((-97 37, -80 37, -80 49, -97 49, -97 37))";
    expect(cityHeatmapParams({ entityId: "x", wkt })["filter.location"]).toBe(wkt);
  });

  it("pins the venue and bar tags that returned full pages live", () => {
    expect(PLACE_TAGS.musicVenue).toBe("urn:tag:category:place:live_music_venue");
    expect(PLACE_TAGS.comedyClub).toBe("urn:tag:genre:place:comedy_club");
    expect(PLACE_TAGS.bar).toBe("urn:tag:genre:place:restaurant:bar");
  });
});
