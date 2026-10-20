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
import { getPlanStore } from "@/lib/storage";

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

  const response = await fetch(built.url, {
    method: built.method,
    headers: built.headers,
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await response.text();
    throw new QlooHttpError(response.status, path, body);
  }
  const payload = (await response.json()) as T;
  await store.cacheSet(cacheKey, payload);
  return payload;
}

export async function liveSearch(params: QlooSearchParams): Promise<QlooEntitiesResponse> {
  const search = new URLSearchParams();
  search.set("query", params.query);
  if (params.types) {
    search.set("types", params.types);
  }
  search.set("take", String(Math.min(params.take ?? 5, QLOO_TAKE_CAP)));
  return qlooFetch<QlooEntitiesResponse>("/search", search);
}

export async function liveEntities(entityIds: string[]): Promise<QlooEntitiesResponse> {
  const search = new URLSearchParams();
  search.set("entity_ids", entityIds.join(","));
  return qlooFetch<QlooEntitiesResponse>("/entities", search);
}

export async function liveInsights(
  raw: QlooInsightsParams,
): Promise<QlooEntitiesResponse | QlooHeatmapResponse> {
  const validated = validateInsightsParams(raw);
  if (!validated.ok) {
    throw new Error(`Refusing Qloo insights call: ${validated.errors.join("; ")}`);
  }
  return qlooFetch("/v2/insights", toSearchParams(validated.params));
}

export async function liveTags(query: string): Promise<QlooTagsResponse> {
  const search = new URLSearchParams();
  if (query) {
    search.set("filter.query", query);
  }
  search.set("take", "20");
  return qlooFetch<QlooTagsResponse>("/v2/tags", search);
}

export async function liveCompare(a: string[], b: string[]): Promise<QlooCompareResponse> {
  const search = new URLSearchParams();
  search.set("a.signal.interests.entities", a.join(","));
  search.set("b.signal.interests.entities", b.join(","));
  try {
    return await qlooFetch<QlooCompareResponse>("/v2/insights/compare", search);
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

export async function liveTrends(entityId: string): Promise<QlooTrendsResponse> {
  const search = new URLSearchParams();
  search.set("entity_id", entityId);
  try {
    const raw = await qlooFetch<Record<string, unknown>>("/trends/entity", search);
    const delta =
      typeof raw.delta === "number"
        ? raw.delta
        : typeof (raw.results as { delta?: number } | undefined)?.delta === "number"
          ? (raw.results as { delta: number }).delta
          : undefined;
    return {
      success: true,
      results: {
        available: true,
        delta,
        window: "wow",
        note: "Week-over-week from /trends/entity",
      },
    };
  } catch (error) {
    if (isAuthOrTypeError(error)) {
      throw error;
    }
    return {
      success: false,
      results: {
        available: false,
        note: error instanceof Error ? error.message : "trends failed",
      },
    };
  }
}
