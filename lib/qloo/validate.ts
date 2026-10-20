import { QLOO_TAKE_CAP } from "@/lib/config";
import { isTagIdList } from "@/lib/qloo/request";
import { INSIGHT_TYPES, type InsightType, type QlooInsightsParams } from "@/lib/qloo/types";

const COMMON = [
  "filter.type",
  "take",
  "page",
  "offset",
  "feature.explainability",
  "bias.trends",
  "sort_by",
  "diversify.by",
  "diversify.take",
  "signal.interests.entities",
  "signal.interests.tags",
  "signal.demographics.age",
  "signal.demographics.gender",
  "signal.demographics.audiences",
  "signal.demographics.audiences.weight",
  "filter.exclude.entities",
  "filter.exclude.tags",
  "operator.exclude.tags",
  "filter.tags",
  "operator.filter.tags",
  "filter.parents.types",
  "filter.popularity.min",
  "filter.popularity.max",
  "filter.results.entities",
  "filter.results.entities.query",
  "filter.external.exists",
  "operator.filter.external.exists",
] as const;

const LOCATION = [
  "filter.location",
  "filter.location.query",
  "filter.location.radius",
  "filter.location.geohash",
  "filter.exclude.location",
  "filter.exclude.location.query",
  "filter.exclude.location.geohash",
  "signal.location",
  "signal.location.query",
  "signal.location.radius",
] as const;

const HEATMAP_OUTPUT = ["output.heatmap.boundary"] as const;

const PLACE_ONLY = [
  ...LOCATION,
  ...HEATMAP_OUTPUT,
  "filter.address",
  "filter.geocode.name",
  "filter.geocode.admin1_region",
  "filter.geocode.admin2_region",
  "filter.geocode.country_code",
  "filter.hotel_class.max",
  "filter.hotel_class.min",
  "filter.hours",
  "filter.price_level.min",
  "filter.price_level.max",
  "filter.price_range.from",
  "filter.price_range.to",
  "filter.properties.business_rating.min",
  "filter.properties.business_rating.max",
  "filter.properties.resy.rating.min",
  "filter.properties.resy.rating.max",
  "filter.references_brand",
  "filter.resy.rating_count.min",
  "filter.resy.rating_count.max",
  "filter.resy.rating.party.min",
  "filter.resy.rating.party.max",
  "filter.external.tripadvisor.rating.count.max",
  "filter.external.tripadvisor.rating.count.min",
  "filter.external.tripadvisor.rating.max",
  "filter.external.tripadvisor.rating.min",
] as const;

const PERSON_ONLY = [
  "filter.date_of_birth.min",
  "filter.date_of_birth.max",
  "filter.date_of_death.min",
  "filter.date_of_death.max",
  "filter.gender",
] as const;

const MEDIA_YEAR = [
  "filter.release_year.min",
  "filter.release_year.max",
  "filter.release_country",
  "operator.filter.release_country",
  "filter.content_rating",
  "filter.rating.min",
  "filter.rating.max",
] as const;

const ALLOW_BY_TYPE: Record<InsightType, readonly string[]> = {
  "urn:entity:artist": [...COMMON, "signal.location", "signal.location.query", "signal.location.radius"],
  "urn:entity:person": [...COMMON, ...PERSON_ONLY, "signal.location", "signal.location.query"],
  "urn:entity:place": [...COMMON, ...PLACE_ONLY],
  "urn:entity:brand": [...COMMON, "signal.location", "signal.location.query"],
  "urn:entity:podcast": [...COMMON, "signal.location", "signal.location.query"],
  "urn:entity:destination": [
    ...COMMON,
    "filter.geocode.name",
    "filter.geocode.admin1_region",
    "filter.geocode.admin2_region",
    "filter.geocode.country_code",
    ...LOCATION,
    ...HEATMAP_OUTPUT,
  ],
  "urn:entity:book": [...COMMON, "filter.publication_year.min", "filter.publication_year.max"],
  "urn:entity:movie": [...COMMON, ...MEDIA_YEAR],
  "urn:entity:tv_show": [
    ...COMMON,
    ...MEDIA_YEAR,
    "filter.finale_year.max",
    "filter.finale_year.min",
    "filter.latest_known_year.max",
    "filter.latest_known_year.min",
  ],
  "urn:entity:video_game": [...COMMON],
};

export type ValidationResult = {
  ok: boolean;
  params: Record<string, string>;
  errors: string[];
  dropped: string[];
};

function asInsightType(value: unknown): InsightType | null {
  if (typeof value !== "string") {
    return null;
  }
  return (INSIGHT_TYPES as readonly string[]).includes(value) ? (value as InsightType) : null;
}

function stringify(value: string | number | boolean): string {
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return String(value);
}

export function validateInsightsParams(input: QlooInsightsParams): ValidationResult {
  const errors: string[] = [];
  const dropped: string[] = [];
  const params: Record<string, string> = {};

  const type = asInsightType(input["filter.type"]);
  if (!type) {
    return {
      ok: false,
      params: {},
      errors: [
        `filter.type must be one of: ${INSIGHT_TYPES.join(", ")}. Invalid parameters are ignored by Qloo and return empty results.`,
      ],
      dropped: Object.keys(input),
    };
  }

  const allow = new Set(ALLOW_BY_TYPE[type]);

  for (const [key, raw] of Object.entries(input)) {
    if (raw === undefined || raw === "") {
      continue;
    }
    if (!allow.has(key)) {
      dropped.push(key);
      continue;
    }
    if (
      (key === "filter.tags" ||
        key === "signal.interests.tags" ||
        key === "filter.exclude.tags") &&
      !isTagIdList(stringify(raw))
    ) {
      dropped.push(key);
      continue;
    }
    if (key === "take") {
      const take = Number(raw);
      if (!Number.isFinite(take) || take < 1) {
        errors.push("take must be a positive number");
        continue;
      }
      params.take = String(Math.min(QLOO_TAKE_CAP, Math.floor(take)));
      continue;
    }
    if (key === "page" || key === "offset") {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) {
        errors.push(`${key} must be a non-negative number`);
        continue;
      }
      params[key] = String(Math.floor(n));
      continue;
    }
    params[key] = stringify(raw);
  }

  if (params["output.heatmap.boundary"]) {
    const hasLocation = Boolean(params["filter.location"] || params["filter.location.query"]);
    if (!hasLocation) {
      errors.push("Heatmap output requires filter.location or filter.location.query");
    }
    const hasSignal = Object.keys(params).some((key) => key.startsWith("signal."));
    if (!hasSignal) {
      errors.push("Heatmap output requires at least one signal.* parameter");
    }
  }

  return {
    ok: errors.length === 0,
    params,
    errors,
    dropped,
  };
}

export function allowedParamsFor(type: InsightType): readonly string[] {
  return ALLOW_BY_TYPE[type];
}

export function isInsightType(value: string): value is InsightType {
  return (INSIGHT_TYPES as readonly string[]).includes(value);
}
