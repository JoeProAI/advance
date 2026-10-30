import { describe, expect, it } from "vitest";
import {
  CAPACITY_BANDS,
  computeDeal,
  defaultAssumptions,
  dealWarnings,
  estimateTicketPrice,
  holdRequestEmail,
  radiusClauseWarnings,
} from "@/lib/settlement/deal";
import type { ResolvedAct, RoutedStop } from "@/lib/types";

const act: ResolvedAct = {
  entityId: "act-1",
  name: "Test Act",
  kind: "artist",
  description: "",
  popularity: 0.9,
};

function stop(over: Partial<RoutedStop> = {}): RoutedStop {
  return {
    order: 1,
    date: "2027-01-08",
    city: { name: "Chicago", region: "IL", country: "US", lat: 41.8781, lon: -87.6298 },
    affinity: 0.9,
    affinityRank: 1,
    venue: {
      entityId: "v-1",
      name: "Club",
      city: "Chicago",
      affinity: 0.5,
      popularity: 0.5,
      estimatedRoom: "",
      size: "club",
      priceLevel: 2,
      why: "",
      tags: [],
    },
    openers: [],
    overlap: 0,
    brief: { audience: "", podcasts: [], bars: [], brands: [], socialPost: "" },
    driveHoursFromPrev: 0,
    milesFromPrev: 0,
    ...over,
  };
}

describe("deal math", () => {
  it("gross = capacity x sell-through x price, offer = max(guarantee, versus)", () => {
    const a = { capacity: 800, sellThrough: 0.7, ticketPrice: 45, guarantee: 10000, versusPct: 0.85 };
    const deal = computeDeal(stop(), a);
    expect(deal.projectedGross).toBe(25200);
    expect(deal.versusAmount).toBe(21420);
    expect(deal.offer).toBe(21420);
    expect(computeDeal(stop(), { ...a, guarantee: 30000 }).offer).toBe(30000);
  });

  it("defaults capacity to the room-size band midpoint", () => {
    const a = defaultAssumptions(stop(), act);
    expect(a.capacity).toBe((CAPACITY_BANDS.club[0] + CAPACITY_BANDS.club[1]) / 2);
    expect(defaultAssumptions(stop({ venue: { ...stop().venue, size: "unknown" } }), act).capacity).toBe(0);
  });

  it("ticket price rides act popularity and price_level", () => {
    expect(estimateTicketPrice(0.9, 2)).toBeGreaterThan(estimateTicketPrice(0.5, 0));
    expect(estimateTicketPrice(1.1)).toBe(estimateTicketPrice(1));
  });

  it("warns on hold rooms, tight drive legs and unknown capacity", () => {
    const holdStop = stop({ venue: { ...stop().venue, name: "Hold", entityId: "thin" } });
    expect(dealWarnings(holdStop).join()).toMatch(/on hold/);
    expect(dealWarnings(stop({ driveHoursFromPrev: 9.2 })).join()).toMatch(/tight drive leg/);
    expect(dealWarnings(stop(), { capacity: 0 } as never).join()).toMatch(/capacity unknown/);
  });

  it("flags radius clauses within 60-100 mi inside 30 days", () => {
    const near = stop({ order: 2, date: "2027-01-10", city: { name: "Milwaukee", region: "WI", country: "US", lat: 43.0389, lon: -87.9065 } });
    const far = stop({ order: 3, date: "2027-03-01", city: { name: "Denver", region: "CO", country: "US", lat: 39.7392, lon: -104.9903 } });
    const map = radiusClauseWarnings([stop(), near, far]);
    expect(map.get(1)![0]).toMatch(/Milwaukee/);
    expect(map.get(2)![0]).toMatch(/Chicago/);
    expect(map.has(3)).toBe(false);
  });

  it("hold request email names act, date, city and venue", () => {
    const email = holdRequestEmail(stop(), act);
    expect(email).toMatch(/Test Act/);
    expect(email).toMatch(/2027-01-08/);
    expect(email).toMatch(/Chicago, IL/);
    expect(email).toMatch(/Club team/);
  });
});
