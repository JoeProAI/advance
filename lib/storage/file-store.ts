import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
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
  const safe = key.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 180);
  return path.join(CACHE, `${safe}.json`);
}

export function createFileStore(): PlanStore {
  return {
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
