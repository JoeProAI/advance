import type { AgentStep, TourPlan } from "@/lib/types";

export type PlanStore = {
  create: (plan: TourPlan) => Promise<TourPlan>;
  get: (id: string) => Promise<TourPlan | null>;
  save: (plan: TourPlan) => Promise<TourPlan>;
  appendStep: (id: string, step: AgentStep) => Promise<TourPlan | null>;
  cacheGet: (key: string) => Promise<unknown | null>;
  cacheSet: (key: string, value: unknown) => Promise<void>;
};
