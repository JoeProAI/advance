import { getFunctionName } from "convex/server";
import { describe, expect, it } from "vitest";
import { CONVEX_CACHE_MAX_BYTES, createConvexStore, type ConvexCaller } from "@/lib/storage/convex-store";
import { selectPlanStore } from "@/lib/storage";
import type { TourPlan } from "@/lib/types";

const SECRET = "test-secret-0123456789abcdef";

/** In-memory stand-in for the Convex functions in convex/, same arg shapes. */
function stubConvex() {
  const plans = new Map<string, string>();
  const cache = new Map<string, string>();
  const limits = new Map<string, { count: number; resetAt: number }>();
  const calls: string[] = [];
  const check = (args: Record<string, unknown>) => {
    if (args.secret !== SECRET) throw new Error("Unauthorized");
  };
  const client: ConvexCaller = {
    async query(ref, args) {
      const name = getFunctionName(ref as never);
      calls.push(name);
      check(args);
      if (name === "plans:get") return plans.get(String(args.shareId)) ?? null;
      if (name === "cache:get") return cache.get(String(args.cacheKey)) ?? null;
      throw new Error(`unknown query ${name}`);
    },
    async mutation(ref, args) {
      const name = getFunctionName(ref as never);
      calls.push(name);
      check(args);
      if (name === "plans:save") {
        plans.set(String(args.shareId), String(args.planJson));
        return null;
      }
      if (name === "plans:appendStep") {
        const raw = plans.get(String(args.shareId));
        if (!raw) return null;
        const plan = JSON.parse(raw);
        plan.steps.push(JSON.parse(String(args.stepJson)));
        const next = JSON.stringify(plan);
        plans.set(String(args.shareId), next);
        return next;
      }
      if (name === "cache:set") {
        cache.set(String(args.cacheKey), String(args.payload));
        return null;
      }
      if (name === "rateLimits:hit") {
        const now = Date.now();
        const key = String(args.key);
        const row = limits.get(key);
        if (!row || row.resetAt <= now) {
          limits.set(key, { count: 1, resetAt: now + Number(args.windowMs) });
          return { ok: true, retryAfterSec: 3600 };
        }
        if (row.count >= Number(args.limit)) return { ok: false, retryAfterSec: 60 };
        row.count += 1;
        return { ok: true, retryAfterSec: 60 };
      }
      throw new Error(`unknown mutation ${name}`);
    },
  };
  return { client, plans, cache, calls };
}

function plan(id = "adv_abc123"): TourPlan {
  return {
    id,
    status: "running",
    createdAt: 1,
    updatedAt: 1,
    request: { actName: "Wednesday", showCount: 6, maxDriveHours: 6, startDate: "2027-01-08", budgetTier: "either" },
    act: null,
    steps: [],
    route: null,
    summary: "",
    qlooMode: "mock",
    writer: "fallback",
    thinData: false,
  } as TourPlan;
}

describe("convex store adapter", () => {
  it("round-trips a plan and appends steps through the mutation", async () => {
    const stub = stubConvex();
    const store = createConvexStore({ secret: SECRET, client: stub.client });
    expect(store.kind).toBe("convex");
    await store.create(plan());
    const after = await store.appendStep("adv_abc123", { id: "s1", label: "Search", status: "done", at: 2 } as never);
    expect(after?.steps).toHaveLength(1);
    const loaded = await store.get("adv_abc123");
    expect(loaded?.request.actName).toBe("Wednesday");
    expect(loaded?.steps).toHaveLength(1);
    expect(await store.get("adv_ffff00")).toBeNull();
    expect(stub.calls).toContain("plans:appendStep");
  });

  it("rejects ids that are not plan ids", async () => {
    const store = createConvexStore({ secret: SECRET, client: stubConvex().client });
    expect(await store.get("../etc")).toBeNull();
    await expect(store.save(plan("../etc"))).rejects.toThrow(/Invalid plan id/);
  });

  it("caches JSON and skips payloads over the document limit", async () => {
    const stub = stubConvex();
    const store = createConvexStore({ secret: SECRET, client: stub.client });
    await store.cacheSet("k1", { results: [{ name: "Ratboys" }] });
    expect(await store.cacheGet("k1")).toEqual({ results: [{ name: "Ratboys" }] });
    await store.cacheSet("big", { blob: "x".repeat(CONVEX_CACHE_MAX_BYTES + 10) });
    expect(stub.cache.has("big")).toBe(false);
    expect(await store.cacheGet("nope")).toBeNull();
  });

  it("treats cache failures as misses", async () => {
    const stub = stubConvex();
    const store = createConvexStore({ secret: "wrong-secret-0123456789abcdef", client: stub.client });
    expect(await store.cacheGet("k1")).toBeNull();
    await expect(store.cacheSet("k1", { a: 1 })).resolves.toBeUndefined();
    await expect(store.get("adv_abc123")).rejects.toThrow(/Unauthorized/);
  });

  it("rate limits on the shared store", async () => {
    const store = createConvexStore({ secret: SECRET, client: stubConvex().client });
    const results = [];
    for (let i = 0; i < 6; i += 1) results.push(await store.rateLimit("plans:abc", 5, 3_600_000));
    expect(results.slice(0, 5).every((r) => r.ok)).toBe(true);
    expect(results[5]!.ok).toBe(false);
  });

  it("is picked by env and needs the secret", () => {
    expect(selectPlanStore({}).kind).toBe("file");
    expect(selectPlanStore({ CONVEX_URL: "https://example.convex.cloud", ADVANCE_STORE_SECRET: SECRET }).kind).toBe("convex");
    expect(() => selectPlanStore({ CONVEX_URL: "https://example.convex.cloud" })).toThrow(/ADVANCE_STORE_SECRET/);
  });
});

describe("plan rate limit configuration", () => {
  it("allows 15 plans per hour", async () => {
    const { PLAN_RATE_LIMIT_PER_HOUR } = await import("@/lib/config");
    expect(PLAN_RATE_LIMIT_PER_HOUR).toBe(15);
  });
});
