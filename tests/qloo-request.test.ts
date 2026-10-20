import { describe, expect, it } from "vitest";
import { QLOO_HACKATHON_HOST } from "@/lib/config";
import {
  HACKATHON_INSIGHT_TYPES,
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
      params: { query: "Marlow" },
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

  it("requests city heatmaps on a supported filter.type, never urn:heatmap", () => {
    const params = cityHeatmapParams({
      entityId: "00000000-1111-4000-8000-000000000001",
      locationQuery: "Midwest United States",
      take: 20,
    });
    expect(params["filter.type"]).toBe("urn:entity:destination");
    expect(HACKATHON_INSIGHT_TYPES).toContain(params["filter.type"]);
    expect(params["filter.type"]).not.toBe("urn:heatmap");
    expect(params["output.heatmap.boundary"]).toBe("city");
    expect(params["filter.location.query"]).toBe("Midwest United States");
    expect(params["signal.interests.entities"]).toBe("00000000-1111-4000-8000-000000000001");

    const built = buildQlooRequest({
      path: "/v2/insights",
      params: {
        "filter.type": String(params["filter.type"]),
        "filter.location.query": String(params["filter.location.query"]),
        "signal.interests.entities": String(params["signal.interests.entities"]),
        "output.heatmap.boundary": String(params["output.heatmap.boundary"]),
      },
      apiKey: KEY,
    });
    expect(built.url).toContain("filter.type=urn%3Aentity%3Adestination");
    expect(built.url).not.toContain("urn%3Aheatmap");
    expect(built.url).toContain("output.heatmap.boundary=city");
  });
});
