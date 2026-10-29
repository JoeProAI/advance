import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// In-memory store so the live-path test never touches .data/.
vi.mock("@/lib/storage", () => {
  const cache = new Map<string, unknown>();
  return {
    getPlanStore: () => ({
      kind: "file",
      rateLimit: async () => ({ ok: true, retryAfterSec: 0 }),
      create: async (plan: unknown) => plan,
      get: async () => null,
      save: async (plan: unknown) => plan,
      appendStep: async () => null,
      cacheGet: async (key: string) => cache.get(key) ?? null,
      cacheSet: async (key: string, value: unknown) => {
        cache.set(key, value);
      },
    }),
  };
});

import { runTourAgent } from "@/lib/agent/run";
import { EXAMPLE_ACTS } from "@/lib/config";
import { findCity } from "@/lib/geo/cities";
import type { PlanRequest } from "@/lib/types";

function request(actName: string, kindHint?: "artist" | "person"): PlanRequest {
  return { actName, kindHint, showCount: 6, maxDriveHours: 6, startDate: "2027-01-08", budgetTier: "either" };
}

describe("tour agent in mock mode", () => {
  beforeEach(() => {
    vi.stubEnv("QLOO_MODE", "mock");
    vi.stubEnv("OPENROUTER_API_KEY", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("routes all three demo tickets", async () => {
    expect(EXAMPLE_ACTS.map((act) => act.name)).toEqual(["MJ Lenderman", "Sam Morril", "Wednesday"]);
    for (const act of EXAMPLE_ACTS) {
      const plan = await runTourAgent(request(act.name, act.kind));
      expect(plan.status).toBe("ready");
      expect(plan.act?.name).toBe(act.name);
      expect(plan.act?.kind).toBe(act.kind);
      expect(plan.route!.stops.length).toBeGreaterThanOrEqual(3);
      for (const stop of plan.route!.stops) {
        expect(stop.venue.estimatedRoom).not.toMatch(/\d+\s*cap/);
        expect(stop.venue.why.length).toBeGreaterThan(10);
      }
    }
  });

  it("answers did-you-mean instead of routing a different act", async () => {
    const plan = await runTourAgent(request("Lenderman"));
    expect(plan.status).toBe("error");
    expect(plan.error).toMatch(/Did you mean MJ Lenderman/);
    expect(plan.route).toBeNull();
  });
});

// Synthetic live-shaped responses keyed by request. Not Qloo data.
function liveStub(failVenues: boolean, idSuffix: string, actName = "Test Band") {
  const act = { name: actName, entity_id: `00000000-9999-4000-8000-${idSuffix.padStart(12, "0")}`, types: ["urn:entity:artist"], popularity: 0.9 };
  const calls: string[] = [];
  const fetchMock = vi.fn(async (input: string | URL) => {
    const url = new URL(String(input));
    calls.push(url.pathname + "?" + url.searchParams.get("filter.type"));
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (url.pathname === "/search" || url.pathname === "/entities") {
      return json({ results: [act] });
    }
    if (url.pathname === "/v2/insights/compare") {
      return json({ results: { tags: [{ tag_id: "urn:tag:t", name: "Shared", query: { score: 0.8 } }] } });
    }
    const type = url.searchParams.get("filter.type");
    if (type === "urn:heatmap") {
      const cells = ["Chicago", "Milwaukee", "Detroit", "Cleveland", "Columbus"].map((name, i) => {
        const city = findCity(name)!;
        return {
          location: { latitude: city.lat + 0.05, longitude: city.lon, geohash: "syn" },
          query: { affinity: 1 - i * 0.05, affinity_rank: 0.9, popularity: 0.9 },
        };
      });
      return json({ success: true, results: { heatmap: cells } });
    }
    if (type === "urn:entity:place" && failVenues && url.searchParams.get("take") === "8") {
      return json({ error: "upstream" }, 500);
    }
    const city = url.searchParams.get("filter.location.query") ?? url.searchParams.get("signal.location.query");
    return json({
      success: true,
      results: {
        entities: [1, 2, 3].map((i) => ({
          name: `${city} ${type?.split(":").pop()} ${i}`,
          entity_id: `${city}-${type}-${i}`,
          type: "urn:entity",
          subtype: type,
          popularity: 0.5,
          tags: i === 1 ? [{ id: "urn:tag:ambience:qloo:intimate", name: "Intimate", type: "urn:tag:ambience:qloo" }] : [],
          query: { affinity: 0.9 - i * 0.1 },
        })),
      },
    });
  });
  return { fetchMock, calls };
}

describe("tour agent against live-shaped responses", () => {
  beforeEach(() => {
    vi.stubEnv("QLOO_MODE", "live");
    vi.stubEnv("QLOO_API_KEY", "test-key-not-real");
    vi.stubEnv("OPENROUTER_API_KEY", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("parses array search results, maps heatmap cells, skips trends, sizes rooms honestly", async () => {
    const { fetchMock, calls } = liveStub(false, "1");
    vi.stubGlobal("fetch", fetchMock);
    const plan = await runTourAgent(request("test band"));
    expect(plan.status).toBe("ready");
    expect(plan.act?.trend).toBeUndefined();
    expect(plan.steps.some((step) => step.title === "Checking momentum")).toBe(false);
    expect(calls.some((call) => call.startsWith("/trends"))).toBe(false);
    expect(calls.filter((call) => call.includes("urn:heatmap"))).toHaveLength(13); // act heatmap + 12 panel baselines
    const cities = plan.route!.stops.map((stop) => stop.city.name);
    expect(cities).toContain("Chicago");
    const stop = plan.route!.stops[0]!;
    expect(stop.venue.estimatedRoom).toMatch(/^Small room \(Qloo tag: Intimate\)/);
    expect(stop.openers[0]?.sharedTagCount).toBe(1);
    expect(stop.openers[0]?.sharedTags?.[0]?.score).toBeCloseTo(0.8, 5);
  });

  it("degrades a non-auth venue failure to a held room instead of failing the plan", async () => {
    const { fetchMock } = liveStub(true, "2");
    vi.stubGlobal("fetch", fetchMock);
    const plan = await runTourAgent(request("Test Band"));
    expect(plan.status).toBe("ready");
    expect(plan.thinData).toBe(true);
    expect(plan.route!.stops.every((stop) => stop.venue.name === "Hold")).toBe(true);
    expect(plan.steps.some((step) => step.status === "warn")).toBe(true);
  });

  it("pulls one opener pool, compares only the lead, and books no one twice while it lasts", async () => {
    const { fetchMock, calls } = liveStub(false, "3", "Pool Band");
    vi.stubGlobal("fetch", fetchMock);
    const plan = await runTourAgent(request("Pool Band"));
    const stops = plan.route!.stops;
    expect(calls.filter((call) => call.endsWith("urn:entity:artist"))).toHaveLength(1);
    // Lead only; a repeated lead reuses its cached compare.
    const leads = new Set(stops.map((stop) => stop.openers[0]?.entityId));
    expect(calls.filter((call) => call.startsWith("/v2/insights/compare"))).toHaveLength(leads.size);
    const firstStop = stops.slice(0, 1).flatMap((stop) => stop.openers.map((o) => o.name));
    expect(new Set(firstStop).size).toBe(firstStop.length);
    expect(stops[0]!.openers[1]?.sharedTagCount).toBeUndefined();
  });

  it("stays inside the run budget when Qloo hangs", async () => {
    const { fetchMock } = liveStub(false, "4", "Slow Band");
    const hanging = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.searchParams.get("filter.type") === "urn:entity:place") {
        return new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted by timeout")));
        });
      }
      return fetchMock(input);
    });
    vi.stubGlobal("fetch", hanging);
    const started = Date.now();
    const plan = await runTourAgent(request("Slow Band"), {}, 3_000);
    expect(Date.now() - started).toBeLessThan(4_500);
    expect(plan.status).toBe("ready");
    expect(plan.route!.stops.every((stop) => stop.venue.name === "Hold")).toBe(true);
  });

  it("still fails hard on a 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("unauthorized", { status: 401 })),
    );
    await expect(runTourAgent(request("Test Band Unauthorized"))).rejects.toThrow(/Qloo key/);
  });
});

describe("swap loop", () => {
  beforeEach(() => {
    vi.stubEnv("QLOO_MODE", "mock");
    vi.stubEnv("OPENROUTER_API_KEY", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("swaps a stadium-only city for the next best market", async () => {
    const plan = await runTourAgent({ ...request("Stadium Test Act"), showCount: 4 });
    expect(plan.status).toBe("ready");
    const cities = plan.route!.stops.map((stop) => stop.city.name);
    expect(cities).not.toContain("Chicago");
    expect(plan.swaps?.some((swap) => swap.city === "Chicago, IL")).toBe(true);
    expect(plan.steps.some((step) => /Swapped Chicago, IL/.test(step.detail))).toBe(true);
    expect(plan.route!.stops.every((stop) => stop.venue.name !== "Hold")).toBe(true);
    expect(plan.route!.stops.every((stop) => !/stadium/i.test(stop.venue.name))).toBe(true);
  });
});
