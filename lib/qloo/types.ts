/**
 * Entity types the hackathon guide lists for `filter.type`.
 */
export const ENTITY_INSIGHT_TYPES = [
  "urn:entity:artist",
  "urn:entity:book",
  "urn:entity:brand",
  "urn:entity:destination",
  "urn:entity:movie",
  "urn:entity:person",
  "urn:entity:place",
  "urn:entity:podcast",
  "urn:entity:tv_show",
  "urn:entity:video_game",
] as const;

/**
 * `urn:heatmap` is the documented heatmap mode. Probed live on the hackathon
 * host (Oct 20, 2026): it answers 200 with geohash cells when given a WKT
 * `filter.location` and a signal. Its `output.heatmap.boundary` only accepts
 * `urn:geohash` or `urn:entity:locality`, so Settlement never sends it.
 */
export const HEATMAP_TYPE = "urn:heatmap" as const;

export const INSIGHT_TYPES = [...ENTITY_INSIGHT_TYPES, HEATMAP_TYPE] as const;

export type EntityInsightType = (typeof ENTITY_INSIGHT_TYPES)[number];
export type InsightType = (typeof INSIGHT_TYPES)[number];

/** Tag as returned on live entities (`entity.tags[]`) and by `/v2/tags`. */
export type QlooTag = {
  id?: string;
  tag_id?: string;
  name: string;
  type?: string;
  subtype?: string;
  value?: string;
};

/** Explainability block: `query.explainability["signal.interests.entities"]`. */
export type QlooExplainability = Record<string, Array<{ entity_id?: string; score?: number }> | undefined>;

/**
 * Live entity shape (search, /entities, and insights). Live responses put
 * `tags` and `location` at the top level and use `types[]` on search hits.
 */
export type QlooEntity = {
  name: string;
  entity_id: string;
  type?: string;
  types?: string[];
  subtype?: string;
  popularity?: number;
  disambiguation?: string;
  tags?: QlooTag[];
  location?: { lat?: number; lon?: number; geohash?: string };
  properties?: {
    short_description?: string;
    description?: string;
    image?: { url: string };
    geocode?: {
      name?: string;
      city?: string;
      metro?: string;
      admin1_region?: string;
      admin2_region?: string;
      country_code?: string;
    };
    price_level?: number;
    business_rating?: number;
    is_closed?: boolean;
  };
  query?: {
    affinity?: number;
    affinity_rank?: number;
    popularity?: number;
    explainability?: QlooExplainability;
  };
};

export type QlooHeatmapCell = {
  location: {
    latitude: number;
    longitude: number;
    geohash: string;
  };
  query: {
    affinity: number;
    affinity_rank: number;
    popularity: number;
  };
};

/** Raw `/v2/insights/compare` result: shared tags scored for both groups. */
export type QlooCompareRaw = {
  success?: boolean;
  results?: {
    tags?: Array<QlooTag & { query?: { score?: number } }>;
    a?: unknown;
    b?: unknown;
    matchEntities?: unknown[];
  };
};

export type QlooCompareResult = {
  overlap: number;
  shared_tags: string[];
  note: string;
  /** Every shared tag Qloo returned. Scores are quantized, the count is not. */
  shared_count?: number;
  scored_tags?: Array<{ name: string; score: number }>;
};

export type QlooTrendResult = {
  available: boolean;
  delta?: number;
  window?: string;
  note: string;
};

/** Normalized list response used inside the app. */
export type QlooEntitiesResponse = {
  success: boolean;
  results: { entities: QlooEntity[] };
  duration?: number;
};

export type QlooHeatmapResponse = {
  success: boolean;
  results: { heatmap: QlooHeatmapCell[] };
  query?: unknown;
  duration?: number;
};

export type QlooTagsResponse = {
  success: boolean;
  results: { tags: QlooTag[] };
};

export type QlooCompareResponse = {
  success: boolean;
  results: QlooCompareResult;
};

export type QlooTrendsResponse = {
  success: boolean;
  results: QlooTrendResult;
};

export type QlooSearchParams = {
  query: string;
  types?: string;
  take?: number;
};

export type QlooInsightsParams = Record<string, string | number | boolean | undefined>;
