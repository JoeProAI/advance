import { QLOO_HACKATHON_HOST, QLOO_TAKE_CAP } from "@/lib/config";
import { QlooHttpError, isAuthOrTypeError } from "@/lib/qloo/errors";
import { buildQlooRequest, toSearchParams } from "@/lib/qloo/request";
import type {
  QlooCompareResponse,
  QlooEntitiesResponse,
  QlooHeatmapResponse,
  QlooInsightsParams,
  QlooSearchParams,
  QlooTagsResponse,
  QlooTrendsResponse,
} from "@/lib/qloo/types";
import { validateInsightsParams } from "@/lib/qloo/validate";
import { overlapFromCompare, parseEntityList, parseHeatmapCells, parseTags } from "@/lib/qloo/parse";
import { getPlanStore } from "@/lib/storage";
import { compactQlooPayload } from "@/lib/qloo/compact";
import {
  QLOO_MIN_CALL_MS,
  QlooDeadlineError,
  callTimeoutMs,
  createLimiter,
  remainingMs,
} from "@/lib/qloo/deadline";

function assertServer(): void {
  if (typeof window !== "undefined") {
    throw new Error("Qloo live calls stay on the server. The API key never ships to the browser.");
  }
}

function apiKey(): string {
  assertServer();
  const key = process.env.QLOO_API_KEY;
  if (!key) {
    throw new Error("QLOO_API_KEY is not set. Live mode needs the hackathon key.");
  }
  return key;
}

const RETRY_WAITS_MS = [800, 2000];
/** At most this many Qloo requests in flight per server instance. */
export const QLOO_CONCURRENCY = 3;
const limit = createLimiter(QLOO_CONCURRENCY);
/** Parallel stops can ask the same thing at once; share one request. */
const inFlight = new Map<string, Promise<unknown>>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function send(built: ReturnType<typeof buildQlooRequest>): Promise<Response> {
  const timeout = callTimeoutMs();
  if (timeout < QLOO_MIN_CALL_MS) {
    throw new QlooDeadlineError(built.path);
  }
  return fetch(built.url, {
    method: built.method,
    headers: built.headers,
    cache: "no-store",
    signal: AbortSignal.timeout(timeout),
  });
}

async function qlooFetch<T>(path: string, search: URLSearchParams): Promise<T> {
  assertServer();
  const built = buildQlooRequest({
    path,
    params: Object.fromEntries(search.entries()),
    apiKey: apiKey(),
    baseUrl: QLOO_HACKATHON_HOST,
  });
  const cacheKey = `${built.path}?${search.toString()}`;
  const store = getPlanStore();
  const cached = await store.cacheGet(cacheKey);
  if (cached) {
    return cached as T;
  }

  const pending = inFlight.get(cacheKey);
  if (pending) {
    return (await pending) as T;
  }
  const request = limit(async () => {
    if (remainingMs() < QLOO_MIN_CALL_MS) {
      throw new QlooDeadlineError(path);
    }
    let response = await send(built);
    // The hackathon host rate-limits bursts (429). Back off and retry, but
    // only while the run still has time for the wait plus another call.
    for (const waitMs of RETRY_WAITS_MS) {
      if (response.status !== 429) {
        break;
      }
      const retryAfter = Number(response.headers.get("retry-after"));
      const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 5000) : waitMs;
      if (remainingMs() < wait + 2_000) {
        break;
      }
      await sleep(wait);
      response = await send(built);
    }
    if (!response.ok) {
      const body = await response.text();
      throw new QlooHttpError(response.status, path, body);
    }
    const payload = compactQlooPayload(await response.json());
    await store.cacheSet(cacheKey, payload);
    return payload;
  });
  inFlight.set(cacheKey, request);
  try {
    return (await request) as T;
  } finally {
    inFlight.delete(cacheKey);
  }
}

export async function liveSearch(params: QlooSearchParams): Promise<QlooEntitiesResponse> {
  const search = new URLSearchParams();
  search.set("query", params.query);
  if (params.types) {
    search.set("types", params.types);
  }
  search.set("take", String(Math.min(params.take ?? 5, QLOO_TAKE_CAP)));
  // Live /search returns `results` as a plain array.
  return parseEntityList(await qlooFetch<unknown>("/search", search));
}

export async function liveEntities(entityIds: string[]): Promise<QlooEntitiesResponse> {
  const search = new URLSearchParams();
  search.set("entity_ids", entityIds.join(","));
  // Live /entities returns `results` as a plain array.
  return parseEntityList(await qlooFetch<unknown>("/entities", search));
}

export async function liveInsights(
  input: QlooInsightsParams,
): Promise<QlooEntitiesResponse | QlooHeatmapResponse> {
  const validated = validateInsightsParams(input);
  if (!validated.ok) {
    throw new Error(`Refusing Qloo insights call: ${validated.errors.join("; ")}`);
  }
  const raw = await qlooFetch<unknown>("/v2/insights", toSearchParams(validated.params));
  if (validated.params["filter.type"] === "urn:heatmap") {
    return { success: true, results: { heatmap: parseHeatmapCells(raw) } };
  }
  return parseEntityList(raw);
}

export async function liveTags(query: string): Promise<QlooTagsResponse> {
  const search = new URLSearchParams();
  if (query) {
    search.set("filter.query", query);
  }
  search.set("take", "20");
  const raw = await qlooFetch<unknown>("/v2/tags", search);
  return { success: true, results: { tags: parseTags(raw) } };
}

export async function liveCompare(a: string[], b: string[]): Promise<QlooCompareResponse> {
  const search = new URLSearchParams();
  search.set("a.signal.interests.entities", a.join(","));
  search.set("b.signal.interests.entities", b.join(","));
  try {
    const raw = await qlooFetch<unknown>("/v2/insights/compare", search);
    return { success: true, results: overlapFromCompare(raw) };
  } catch (error) {
    if (isAuthOrTypeError(error)) {
      throw error;
    }
    return {
      success: false,
      results: {
        overlap: 0,
        shared_tags: [],
        note: error instanceof Error ? error.message : "compare failed",
      },
    };
  }
}

/**
 * Trends are not served on the hackathon host: `/trends/entity` and
 * `/trends/category` answered 404 and `/v2/trending` returned an empty list
 * (Oct 20, 2026). Live mode reports trends as unavailable without spending a
 * call, and the agent hides momentum.
 */
export async function liveTrends(entityId: string): Promise<QlooTrendsResponse> {
  void entityId;
  return {
    success: false,
    results: {
      available: false,
      note: "Trends are not available on the Qloo hackathon host.",
    },
  };
}
