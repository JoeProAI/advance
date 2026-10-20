import type { AgentStep, TourPlan } from "@/lib/types";

export type RateLimitResult = { ok: boolean; retryAfterSec: number };

export type PlanStore = {
  kind: "file" | "convex";
  create: (plan: TourPlan) => Promise<TourPlan>;
  get: (id: string) => Promise<TourPlan | null>;
  save: (plan: TourPlan) => Promise<TourPlan>;
  appendStep: (id: string, step: AgentStep) => Promise<TourPlan | null>;
  cacheGet: (key: string) => Promise<unknown | null>;
  cacheSet: (key: string, value: unknown) => Promise<void>;
  /** Fixed-window counter keyed by an opaque (already hashed) key. */
  rateLimit: (key: string, limit: number, windowMs: number) => Promise<RateLimitResult>;
};
