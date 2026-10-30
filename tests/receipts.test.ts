import { describe, expect, it } from "vitest";
import { summarizePayload, type QlooCallReceipt } from "@/lib/qloo/trace";
import { attachReceipts } from "@/lib/agent/run";
import type { RoutedStop, TourPlan } from "@/lib/types";

function call(over: Partial<QlooCallReceipt> = {}): QlooCallReceipt {
  return {
    n: 1,
    purpose: "plan",
    path: "/v2/insights",
    params: {},
    source: "mock",
    ms: 10,
    resultCount: 0,
    entityIds: [],
    ...over,
  };
}

function stop(entityId: string): RoutedStop {
  return {
    order: 1,
    date: "2027-01-08",
    city: { name: "Chicago", region: "IL", country: "US", lat: 41.8781, lon: -87.6298 },
    affinity: 0.9,
    affinityRank: 1,
    venue: {
      entityId,
      name: "Room",
      city: "Chicago",
      affinity: 0.5,
      popularity: 0.5,
      estimatedRoom: "",
      why: "",
      tags: [],
    },
    openers: [{ entityId: "op-1", name: "Opener", kind: "artist", affinity: 0.5, popularity: 0.5, why: "" }],
    overlap: 0,
    brief: { audience: "", podcasts: [], bars: [], brands: [], socialPost: "" },
    driveHoursFromPrev: 0,
    milesFromPrev: 0,
    receipt: { heat: { cellPopularity: 1, affinityRank: 1, cityScore: 0.9 }, callNs: [], promoEntityIds: ["promo-1"] },
  };
}

function planWith(stops: RoutedStop[]): Omit<TourPlan, "id" | "createdAt" | "updatedAt"> {
  return {
    status: "ready",
    request: {} as never,
    act: { entityId: "act-1", name: "Act", kind: "artist", description: "", popularity: 0.9 },
    steps: [],
    route: { stops, totalMiles: 0, totalDriveHours: 0, nights: 7 },
    summary: "",
    qlooMode: "mock",
    writer: "fallback",
    thinData: false,
  };
}

describe("summarizePayload", () => {
  it("reads entity arrays, heatmap cells and tag lists", () => {
    expect(summarizePayload({ results: { entities: [{ entity_id: "a" }, { entity_id: "b" }] } })).toEqual({
      resultCount: 2,
      entityIds: ["a", "b"],
    });
    expect(summarizePayload({ results: { heatmap: [{ entity_id: "c" }] } })).toEqual({
      resultCount: 1,
      entityIds: ["c"],
    });
    expect(summarizePayload({ results: [{ entity_id: "d" }] })).toEqual({ resultCount: 1, entityIds: ["d"] });
    expect(summarizePayload(null)).toEqual({ resultCount: 0, entityIds: [] });
  });
});

describe("attachReceipts", () => {
  it("reports invented 0 when every named entity appeared in a call", () => {
    const calls = [
      call({ n: 1, entityIds: ["act-1"] }),
      call({ n: 2, purpose: "stop:Chicago, IL", entityIds: ["v-1", "op-1"] }),
      call({ n: 3, purpose: "stop:Chicago, IL", entityIds: ["promo-1"] }),
    ];
    const plan = attachReceipts(planWith([stop("v-1")]), calls);
    expect(plan.receipts!.invented).toBe(0);
    expect(plan.receipts!.checkedEntities).toBe(4);
    expect(plan.receipts!.totals.calls).toBe(3);
    expect(plan.route!.stops[0]!.receipt!.callNs).toEqual([2, 3]);
  });

  it("reports invented 1 when a sheet entity never came back from Qloo", () => {
    const calls = [call({ n: 1, entityIds: ["act-1", "op-1", "promo-1"] })];
    const plan = attachReceipts(planWith([stop("v-missing")]), calls);
    expect(plan.receipts!.invented).toBe(1);
  });

  it("does not count the 'thin' hold marker as a named entity", () => {
    const calls = [call({ n: 1, entityIds: ["act-1", "op-1", "promo-1"] })];
    const plan = attachReceipts(planWith([stop("thin")]), calls);
    expect(plan.receipts!.invented).toBe(0);
    expect(plan.receipts!.checkedEntities).toBe(3);
  });
});
