import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Receipts. Every Qloo call made during one plan run is recorded here: the
 * path, the query string sent (the API key travels in a header and is never
 * recorded), where the answer came from, how long it took, and the entity
 * IDs Qloo returned. The plan stores this list so a judge can open it.
 */
export type QlooCallSource = "live" | "cache" | "shared" | "mock" | "error";

export type QlooCallReceipt = {
  n: number;
  purpose: string;
  path: string;
  params: Record<string, string>;
  source: QlooCallSource;
  httpStatus?: number;
  ms: number;
  resultCount: number;
  entityIds: string[];
  error?: string;
};

type TraceState = { calls: QlooCallReceipt[] };
type PurposeState = { purpose: string };

const traceStore = new AsyncLocalStorage<TraceState>();
const purposeStore = new AsyncLocalStorage<PurposeState>();

export const RECEIPT_IDS_PER_CALL = 60;

export async function withTrace<T>(fn: () => Promise<T>): Promise<{ value: T; calls: QlooCallReceipt[] }> {
  const state: TraceState = { calls: [] };
  const value = await traceStore.run(state, fn);
  return { value, calls: state.calls };
}

/** Label every Qloo call made inside `fn` (for example "venue:Chicago"). */
export function withPurpose<T>(purpose: string, fn: () => Promise<T>): Promise<T> {
  return purposeStore.run({ purpose }, fn);
}

export function currentPurpose(): string {
  return purposeStore.getStore()?.purpose ?? "plan";
}

/** Pull entity IDs and a result count out of any Qloo payload shape. */
export function summarizePayload(payload: unknown): { resultCount: number; entityIds: string[] } {
  const results = (payload as { results?: unknown } | null)?.results;
  let list: unknown[] = [];
  if (Array.isArray(results)) {
    list = results;
  } else if (results && typeof results === "object") {
    const record = results as Record<string, unknown>;
    const inner = record.entities ?? record.heatmap ?? record.tags;
    if (Array.isArray(inner)) list = inner;
  }
  const entityIds: string[] = [];
  for (const item of list) {
    const id = (item as { entity_id?: unknown })?.entity_id;
    if (typeof id === "string" && entityIds.length < RECEIPT_IDS_PER_CALL) entityIds.push(id);
  }
  return { resultCount: list.length, entityIds };
}

export function recordCall(entry: Omit<QlooCallReceipt, "n" | "purpose"> & { purpose?: string }): void {
  const state = traceStore.getStore();
  if (!state) return;
  state.calls.push({ ...entry, purpose: entry.purpose ?? currentPurpose(), n: state.calls.length + 1 });
}

export function hasTrace(): boolean {
  return Boolean(traceStore.getStore());
}
