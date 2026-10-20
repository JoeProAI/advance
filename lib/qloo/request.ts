import { QLOO_HACKATHON_HOST } from "@/lib/config";
import { CONUS_WKT } from "@/lib/geo/cities";
import { HEATMAP_TYPE, INSIGHT_TYPES, type InsightType, type QlooInsightsParams } from "@/lib/qloo/types";

/**
 * Hackathon Insights `filter.type` values: the ten entity types from the
 * developer guide plus `urn:heatmap`, which the hackathon host serves
 * (verified live Oct 20, 2026).
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
 * Fan heatmap for one act: `filter.type=urn:heatmap` over a WKT polygon.
 * Live behavior (Oct 20, 2026): returns unnamed geohash-4 cells with
 * affinity, affinity_rank, and popularity. Do not send
 * `output.heatmap.boundary=city`; Qloo answers 400. Cells are mapped to
 * cities client side (see `cellsToCities`).
 * Heatmap reference: https://docs.qloo.com/reference/insights-api-deep-dive
 */
export function cityHeatmapParams(input: { entityId: string; wkt?: string }): QlooInsightsParams {
  return {
    "filter.type": HEATMAP_TYPE,
    "filter.location": input.wkt ?? CONUS_WKT,
    "signal.interests.entities": input.entityId,
  };
}

/**
 * Fixed place tags, checked live on the hackathon host. The tag search
 * auto-pick (`urn:tag:setting:qloo:music_venue`) returned only 3 Chicago
 * rooms; the category tag returns full pages in every city probed.
 */
export const PLACE_TAGS = {
  musicVenue: "urn:tag:category:place:live_music_venue",
  comedyClub: "urn:tag:genre:place:comedy_club",
  bar: "urn:tag:genre:place:restaurant:bar",
} as const;

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
