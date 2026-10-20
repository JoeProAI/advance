import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import type { AgentStep, TourPlan } from "@/lib/types";
import type { PlanStore } from "@/lib/storage/types";

const ROOT = path.join(process.cwd(), ".data");
const PLANS = path.join(ROOT, "plans");
const CACHE = path.join(ROOT, "cache");

async function ensure(): Promise<void> {
  await mkdir(PLANS, { recursive: true });
  await mkdir(CACHE, { recursive: true });
}

function planPath(id: string): string {
  if (!/^adv_[a-f0-9]+$/.test(id)) {
    throw new Error("Invalid plan id");
  }
  return path.join(PLANS, `${id}.json`);
}

function cachePath(key: string): string {
  // Hash the full key. Truncating long insight URLs let two different
  // requests (same prefix, different act or take) share one cache file.
  const prefix = key.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 60);
  const digest = createHash("sha256").update(key).digest("hex").slice(0, 24);
  return path.join(CACHE, `${prefix}-${digest}.json`);
}

type Bucket = { count: number; resetAt: number };

export function createFileStore(): PlanStore {
  // Local dev only: one process, so an in-memory window is enough.
  const buckets = new Map<string, Bucket>();
  return {
    kind: "file",
    async rateLimit(key, limit, windowMs) {
      const now = Date.now();
      const current = buckets.get(key);
      if (!current || current.resetAt <= now) {
        buckets.set(key, { count: 1, resetAt: now + windowMs });
        return { ok: true, retryAfterSec: Math.ceil(windowMs / 1000) };
      }
      const retryAfterSec = Math.ceil((current.resetAt - now) / 1000);
      if (current.count >= limit) {
        return { ok: false, retryAfterSec };
      }
      current.count += 1;
      return { ok: true, retryAfterSec };
    },
    async create(plan) {
      await ensure();
      await writeFile(planPath(plan.id), JSON.stringify(plan), "utf8");
      return plan;
    },
    async get(id) {
      await ensure();
      try {
        const raw = await readFile(planPath(id), "utf8");
        return JSON.parse(raw) as TourPlan;
      } catch {
        return null;
      }
    },
    async save(plan) {
      await ensure();
      await writeFile(planPath(plan.id), JSON.stringify(plan), "utf8");
      return plan;
    },
    async appendStep(id, step: AgentStep) {
      const plan = await this.get(id);
      if (!plan) {
        return null;
      }
      plan.steps = [...plan.steps, step];
      plan.updatedAt = Date.now();
      await this.save(plan);
      return plan;
    },
    async cacheGet(key) {
      await ensure();
      try {
        const raw = await readFile(cachePath(key), "utf8");
        return JSON.parse(raw) as unknown;
      } catch {
        return null;
      }
    },
    async cacheSet(key, value) {
      await ensure();
      await writeFile(cachePath(key), JSON.stringify(value), "utf8");
    },
  };
}
