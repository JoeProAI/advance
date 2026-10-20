import { createConvexStore } from "@/lib/storage/convex-store";
import { createFileStore } from "@/lib/storage/file-store";
import type { PlanStore } from "@/lib/storage/types";

let store: PlanStore | undefined;

/**
 * CONVEX_URL set: shared Convex store (needed on Vercel, where the disk is
 * read-only and each instance has its own). Otherwise the local file store
 * under .data/.
 */
export function selectPlanStore(env: Record<string, string | undefined> = process.env): PlanStore {
  const url = env.CONVEX_URL?.trim();
  if (url) {
    return createConvexStore({ url, secret: env.ADVANCE_STORE_SECRET ?? "" });
  }
  return createFileStore();
}

export function getPlanStore(): PlanStore {
  if (!store) {
    store = selectPlanStore();
  }
  return store;
}

export type { PlanStore, RateLimitResult } from "@/lib/storage/types";
