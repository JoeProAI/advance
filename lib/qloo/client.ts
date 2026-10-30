import { QLOO_CALL_BUDGET } from "@/lib/config";
import type { QlooMode } from "@/lib/types";
import {
  liveCompare,
  liveEntities,
  liveInsights,
  liveSearch,
  liveTags,
  liveTrends,
} from "@/lib/qloo/live";
import {
  mockCompare,
  mockEntities,
  mockInsights,
  mockSearch,
  mockTags,
  mockTrends,
} from "@/lib/qloo/mock";
import type {
  QlooCompareResponse,
  QlooEntitiesResponse,
  QlooHeatmapResponse,
  QlooInsightsParams,
  QlooSearchParams,
  QlooTagsResponse,
  QlooTrendsResponse,
} from "@/lib/qloo/types";
import { recordCall, summarizePayload } from "@/lib/qloo/trace";
import { validateInsightsParams } from "@/lib/qloo/validate";

export type QlooClient = {
  mode: QlooMode;
  calls: number;
  search: (params: QlooSearchParams) => Promise<QlooEntitiesResponse>;
  entities: (entityIds: string[]) => Promise<QlooEntitiesResponse>;
  insights: (params: QlooInsightsParams) => Promise<QlooEntitiesResponse | QlooHeatmapResponse>;
  tags: (query: string) => Promise<QlooTagsResponse>;
  compare: (a: string[], b: string[]) => Promise<QlooCompareResponse>;
  trends: (entityId: string) => Promise<QlooTrendsResponse>;
};

function resolveMode(explicit?: QlooMode): QlooMode {
  if (explicit) {
    return explicit;
  }
  const env = process.env.QLOO_MODE;
  if (env === "live") {
    return "live";
  }
  return "mock";
}

/** Mock calls get receipts too, marked "mock", so the drawer never lies. */
async function mocked<T>(path: string, params: Record<string, unknown>, run: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  const value = await run();
  const flat = Object.fromEntries(Object.entries(params).map(([key, v]) => [key, String(v)]));
  recordCall({ path, params: flat, source: "mock", ms: Date.now() - startedAt, ...summarizePayload(value) });
  return value;
}

export function createQlooClient(explicit?: QlooMode): QlooClient {
  const mode = resolveMode(explicit);
  let calls = 0;

  const budget = () => {
    calls += 1;
    if (calls > QLOO_CALL_BUDGET) {
      throw new Error(`Qloo call budget (${QLOO_CALL_BUDGET}) exceeded for this plan.`);
    }
  };

  return {
    get mode() {
      return mode;
    },
    get calls() {
      return calls;
    },
    async search(params) {
      budget();
      return mode === "live" ? liveSearch(params) : mocked("/search", params, () => mockSearch(params));
    },
    async entities(entityIds) {
      budget();
      return mode === "live" ? liveEntities(entityIds) : mocked("/entities", { entity_ids: entityIds.join(",") }, () => mockEntities(entityIds));
    },
    async insights(params) {
      const validated = validateInsightsParams(params);
      if (!validated.ok) {
        throw new Error(`Bad insights params: ${validated.errors.join("; ")}`);
      }
      budget();
      if (mode === "live") {
        return liveInsights(validated.params);
      }
      return mocked("/v2/insights", validated.params, () => mockInsights(validated.params));
    },
    async tags(query) {
      budget();
      return mode === "live" ? liveTags(query) : mockTags(query);
    },
    async compare(a, b) {
      budget();
      return mode === "live" ? liveCompare(a, b) : mocked("/v2/insights/compare", { "a.signal.interests.entities": a.join(","), "b.signal.interests.entities": b.join(",") }, () => mockCompare(a, b));
    },
    async trends(entityId) {
      if (mode === "live") {
        // No network call: the hackathon host does not serve trends.
        return liveTrends(entityId);
      }
      budget();
      return mockTrends(entityId);
    },
  };
}

export function isHeatmapResponse(
  value: QlooEntitiesResponse | QlooHeatmapResponse,
): value is QlooHeatmapResponse {
  return "heatmap" in value.results;
}
