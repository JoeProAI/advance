import { QLOO_HACKATHON_HOST } from "@/lib/config";
import { INSIGHT_TYPES, type InsightType, type QlooInsightsParams } from "@/lib/qloo/types";

/**
 * Hackathon Insights `filter.type` is the ten-entity list only.
 * `urn:heatmap` is not on that list and will 403 or return an empty 200.
 * See the Oct 7 developer guide and
 * https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide
 */
export const HACKATHON_INSIGHT_TYPES = INSIGHT_TYPES;
export type HackathonInsightType = InsightType;

export type QlooBuiltRequest = {
  method: "GET";
  url: string;
  path: string;
  headers: {
    "X-Api-Key": string;
    Accept: "application/json";
  };
};

function assertPath(path: string): void {
  if (!path.startsWith("/") || path === "/") {
    throw new Error("Qloo calls must append a path to https://hackathon.api.qloo.com");
  }
}

export function qlooHeaders(apiKey: string): QlooBuiltRequest["headers"] {
  return {
    "X-Api-Key": apiKey,
    Accept: "application/json",
  };
}

export function toSearchParams(record: Record<string, string>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(record)) {
    if (value !== "") {
      params.set(key, value);
    }
  }
  return params;
}

export function buildQlooRequest(input: {
  path: string;
  params?: Record<string, string>;
  apiKey: string;
  baseUrl?: string;
}): QlooBuiltRequest {
  assertPath(input.path);
  const base = (input.baseUrl ?? QLOO_HACKATHON_HOST).replace(/\/$/, "");
  if (base !== QLOO_HACKATHON_HOST) {
    throw new Error(`Qloo hackathon calls use ${QLOO_HACKATHON_HOST} only.`);
  }
  const search = toSearchParams(input.params ?? {});
  const query = search.toString();
  const url = query ? `${base}${input.path}?${query}` : `${base}${input.path}`;
  return {
    method: "GET",
    url,
    path: input.path,
    headers: qlooHeaders(input.apiKey),
  };
}

/**
 * City heatmaps are not `filter.type=urn:heatmap`.
 * Request a supported type that accepts a location, then set
 * `output.heatmap.boundary` (city | neighborhood | geohash).
 * Documented on https://docs.qloo.com/reference/insights-api-deep-dive
 * (`output.heatmap.boundary`). Hackathon-supported types:
 * https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide
 */
export function cityHeatmapParams(input: {
  entityId: string;
  locationQuery: string;
  take?: number;
}): QlooInsightsParams {
  return {
    "filter.type": "urn:entity:destination",
    "filter.location.query": input.locationQuery,
    "signal.interests.entities": input.entityId,
    "output.heatmap.boundary": "city",
    take: input.take ?? 20,
  };
}

export function isTagIdList(value: string): boolean {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .every((part) => part.startsWith("urn:tag:"));
}

export function isHackathonInsightType(value: string): value is HackathonInsightType {
  return (HACKATHON_INSIGHT_TYPES as readonly string[]).includes(value);
}
