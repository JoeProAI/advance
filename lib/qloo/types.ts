export const INSIGHT_TYPES = [
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

export type InsightType = (typeof INSIGHT_TYPES)[number];

export type QlooEntity = {
  name: string;
  entity_id: string;
  type: string;
  subtype?: string;
  properties?: {
    description?: string;
    image?: { url: string };
    geocode?: {
      name?: string;
      latitude?: number;
      longitude?: number;
      city?: string;
      admin1_region?: string;
      country_code?: string;
    };
    popularity?: number;
    tags?: Array<{ id: string; name: string; type: string }>;
    capacity?: number;
    place_kind?: string;
  };
  popularity?: number;
  query?: {
    affinity?: number;
    affinity_rank?: number;
    popularity?: number;
    explainability?: {
      signals?: Array<{ name: string; weight?: number; score?: number }>;
    };
  };
  disambiguation?: string;
};

export type QlooHeatmapCell = {
  location: {
    latitude: number;
    longitude: number;
    geohash: string;
    name?: string;
    admin1_region?: string;
  };
  query: {
    affinity: number;
    affinity_rank: number;
    popularity: number;
  };
};

export type QlooTag = {
  id?: string;
  tag_id?: string;
  name: string;
  type?: string;
  subtype?: string;
};

export type QlooCompareResult = {
  overlap: number;
  shared_tags: string[];
  note: string;
};

export type QlooTrendResult = {
  available: boolean;
  delta?: number;
  window?: string;
  note: string;
};

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
