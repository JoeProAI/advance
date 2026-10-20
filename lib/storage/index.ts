import { createFileStore } from "@/lib/storage/file-store";
import type { PlanStore } from "@/lib/storage/types";

let store: PlanStore | undefined;

export function getPlanStore(): PlanStore {
  if (!store) {
    store = createFileStore();
  }
  return store;
}

export type { PlanStore } from "@/lib/storage/types";
