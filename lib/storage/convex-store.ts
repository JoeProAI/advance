import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import type { AgentStep, TourPlan } from "@/lib/types";
import type { PlanStore, RateLimitResult } from "@/lib/storage/types";

/** The two calls the adapter needs; ConvexHttpClient satisfies it, tests pass a stub. */
export type ConvexCaller = {
  query: (ref: unknown, args: Record<string, unknown>) => Promise<unknown>;
  mutation: (ref: unknown, args: Record<string, unknown>) => Promise<unknown>;
};

/** Convex caps a document near 1 MiB; skip cache rows that would not fit. */
export const CONVEX_CACHE_MAX_BYTES = 900_000;

const api = anyApi as unknown as {
  plans: { get: unknown; save: unknown; appendStep: unknown };
  cache: { get: unknown; set: unknown };
  rateLimits: { hit: unknown };
};

function assertId(id: string): void {
  if (!/^adv_[a-f0-9]+$/.test(id)) {
    throw new Error("Invalid plan id");
  }
}

export function createConvexStore(input: { url?: string; secret: string; client?: ConvexCaller }): PlanStore {
  if (!input.secret || input.secret.length < 24) {
    throw new Error("ADVANCE_STORE_SECRET must be set (24+ chars) when CONVEX_URL is set.");
  }
  const client: ConvexCaller =
    input.client ?? (new ConvexHttpClient(input.url ?? "") as unknown as ConvexCaller);
  const secret = input.secret;

  const save = async (plan: TourPlan): Promise<TourPlan> => {
    assertId(plan.id);
    await client.mutation(api.plans.save, {
      secret,
      shareId: plan.id,
      status: plan.status,
      planJson: JSON.stringify(plan),
    });
    return plan;
  };

  return {
    kind: "convex",
    create: save,
    save,
    async get(id) {
      if (!/^adv_[a-f0-9]+$/.test(id)) {
        return null;
      }
      const raw = await client.query(api.plans.get, { secret, shareId: id });
      return typeof raw === "string" ? (JSON.parse(raw) as TourPlan) : null;
    },
    async appendStep(id, step: AgentStep) {
      assertId(id);
      const raw = await client.mutation(api.plans.appendStep, {
        secret,
        shareId: id,
        stepJson: JSON.stringify(step),
      });
      return typeof raw === "string" ? (JSON.parse(raw) as TourPlan) : null;
    },
    async cacheGet(key) {
      try {
        const raw = await client.query(api.cache.get, { secret, cacheKey: key });
        return typeof raw === "string" ? (JSON.parse(raw) as unknown) : null;
      } catch {
        // A cache miss is never fatal.
        return null;
      }
    },
    async cacheSet(key, value) {
      const payload = JSON.stringify(value);
      if (payload.length > CONVEX_CACHE_MAX_BYTES) {
        return;
      }
      try {
        await client.mutation(api.cache.set, { secret, cacheKey: key, payload });
      } catch {
        // Losing a cache write only costs a repeat Qloo call later.
      }
    },
    async rateLimit(key, limit, windowMs): Promise<RateLimitResult> {
      const result = (await client.mutation(api.rateLimits.hit, { secret, key, limit, windowMs })) as RateLimitResult;
      return { ok: Boolean(result?.ok), retryAfterSec: Number(result?.retryAfterSec ?? 0) };
    },
  };
}
