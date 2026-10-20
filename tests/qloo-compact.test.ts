import { describe, expect, it } from "vitest";
import { compactQlooPayload } from "@/lib/qloo/compact";
import { cellsToCities, parseEntityList, parseHeatmapCells, overlapFromCompare } from "@/lib/qloo/parse";
import { callTimeoutMs, createLimiter, remainingMs, withDeadline, QLOO_CALL_TIMEOUT_MS } from "@/lib/qloo/deadline";

describe("compact cache payloads", () => {
  it("keeps what the readers need and drops long text", () => {
    const raw = {
      success: true,
      results: {
        entities: [
          {
            name: "Ratboys",
            entity_id: "E1",
            subtype: "urn:entity:artist",
            popularity: 0.9,
            tags: [{ id: "urn:tag:genre:music:indie", name: "Indie", type: "urn:tag:genre", extra: "x" }],
            properties: { biography: "b".repeat(5000), start_year: ["2010"], image: { url: "u" } },
            query: { affinity: 0.8 },
            external: { spotify: [{ id: "s" }] },
          },
        ],
      },
    };
    const small = compactQlooPayload(raw) as typeof raw;
    const entity = parseEntityList(small).results.entities[0]!;
    expect(entity.name).toBe("Ratboys");
    expect((entity.properties as Record<string, unknown>).start_year).toEqual(["2010"]);
    expect(String((entity.properties as Record<string, unknown>).biography).length).toBe(600);
    expect(JSON.stringify(small)).not.toContain("spotify");
    expect(JSON.stringify(small)).not.toContain("image");
  });

  it("drops only heatmap cells no city can use", () => {
    const cell = (lat: number, lon: number, affinity: number) => ({
      location: { latitude: lat, longitude: lon, geohash: "x" },
      query: { affinity, affinity_rank: 0.5, popularity: 0.7 },
    });
    const raw = { success: true, results: { heatmap: [cell(41.88, -87.63, 0.9), cell(35.6, -82.55, 0.8), cell(44.5, -110.5, 1)] } };
    const small = compactQlooPayload(raw);
    expect(parseHeatmapCells(small)).toHaveLength(2);
    expect(cellsToCities(parseHeatmapCells(small))).toEqual(cellsToCities(parseHeatmapCells(raw)));
  });

  it("keeps compare scores", () => {
    const raw = { success: true, results: { tags: [{ name: "Indie", tag_id: "t", query: { score: 0.7, extra: 1 } }] } };
    expect(overlapFromCompare(compactQlooPayload(raw)).overlap).toBeCloseTo(0.7);
  });
});

describe("run deadline", () => {
  it("caps each call by what is left of the run", async () => {
    expect(callTimeoutMs()).toBe(QLOO_CALL_TIMEOUT_MS);
    await withDeadline(4_000, async () => {
      expect(remainingMs()).toBeLessThanOrEqual(4_000);
      expect(callTimeoutMs()).toBeLessThanOrEqual(3_000);
    });
    await withDeadline(500, async () => {
      expect(callTimeoutMs()).toBe(0);
    });
  });

  it("limits concurrency", async () => {
    const limit = createLimiter(2);
    let active = 0;
    let peak = 0;
    await Promise.all(
      Array.from({ length: 6 }, () =>
        limit(async () => {
          active += 1;
          peak = Math.max(peak, active);
          await new Promise((resolve) => setTimeout(resolve, 5));
          active -= 1;
        }),
      ),
    );
    expect(peak).toBe(2);
  });
});
