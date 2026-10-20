/**
 * Trim live Qloo payloads before they are cached. The result keeps the raw
 * shape the readers in parse.ts accept, so cached and fresh responses parse
 * the same way. Heatmaps shrink from about 1.5 MB to well under the 1 MiB
 * Convex document limit; entity lists drop long text the app never reads.
 */
import { US_CITIES } from "@/lib/geo/cities";
import { HEATMAP_CITY_RADIUS_MILES } from "@/lib/qloo/parse";
import { haversineMiles } from "@/lib/routing/plan";

/** Cells farther than this from every routable city can never be used. */
const KEEP_CELL_MILES = HEATMAP_CITY_RADIUS_MILES + 5;

function nearAnyCity(cell: Record<string, unknown>): boolean {
  const location = isRecord(cell.location) ? cell.location : {};
  const lat = Number(location.latitude);
  const lon = Number(location.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  return US_CITIES.some((city) => haversineMiles({ lat, lon }, city) <= KEEP_CELL_MILES);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const round = (value: unknown, digits = 4): unknown =>
  typeof value === "number" ? Number(value.toFixed(digits)) : value;

const PROPERTY_KEYS = [
  "short_description",
  "geocode",
  "price_level",
  "start_year",
  "obscurity_scale",
  "place_of_birth",
  "is_group",
] as const;

function compactEntity(entity: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of ["name", "entity_id", "type", "types", "subtype", "popularity", "location"]) {
    if (entity[key] !== undefined) out[key] = entity[key];
  }
  if (Array.isArray(entity.tags)) {
    out.tags = entity.tags.filter(isRecord).map((tag) => ({
      id: tag.id,
      tag_id: tag.tag_id,
      name: tag.name,
      type: tag.type,
    }));
  }
  if (isRecord(entity.properties)) {
    const props: Record<string, unknown> = {};
    for (const key of PROPERTY_KEYS) {
      if (entity.properties[key] !== undefined) props[key] = entity.properties[key];
    }
    // Only the first stretch of a biography is used (hometown checks).
    if (typeof entity.properties.biography === "string") {
      props.biography = entity.properties.biography.slice(0, 600);
    }
    if (typeof entity.properties.description === "string" && !props.short_description) {
      props.description = entity.properties.description.slice(0, 400);
    }
    out.properties = props;
  }
  if (isRecord(entity.query)) {
    const q: Record<string, unknown> = {};
    for (const key of ["affinity", "affinity_rank", "popularity", "explainability"]) {
      if (entity.query[key] !== undefined) q[key] = entity.query[key];
    }
    out.query = q;
  }
  return out;
}

function compactHeatmapCell(cell: Record<string, unknown>): unknown {
  const location = isRecord(cell.location) ? cell.location : {};
  const query = isRecord(cell.query) ? cell.query : {};
  return {
    location: { latitude: round(location.latitude), longitude: round(location.longitude), geohash: location.geohash },
    query: { affinity: round(query.affinity), affinity_rank: round(query.affinity_rank), popularity: round(query.popularity) },
  };
}

export function compactQlooPayload(raw: unknown): unknown {
  if (Array.isArray(raw)) {
    return raw.map((item) => (isRecord(item) ? compactEntity(item) : item));
  }
  if (!isRecord(raw)) {
    return raw;
  }
  const results = raw.results;
  const base: Record<string, unknown> = { success: raw.success ?? true };
  if (Array.isArray(results)) {
    return { ...base, results: results.map((item) => (isRecord(item) && typeof item.entity_id === "string" ? compactEntity(item) : item)) };
  }
  if (isRecord(results)) {
    if (Array.isArray(results.heatmap)) {
      return { ...base, results: { heatmap: results.heatmap.filter(isRecord).filter(nearAnyCity).map(compactHeatmapCell) } };
    }
    if (Array.isArray(results.entities)) {
      return { ...base, results: { entities: results.entities.filter(isRecord).map(compactEntity) } };
    }
    if (Array.isArray(results.tags)) {
      return {
        ...base,
        results: {
          tags: results.tags.filter(isRecord).map((tag) => ({
            id: tag.id,
            tag_id: tag.tag_id,
            name: tag.name,
            type: tag.type,
            query: isRecord(tag.query) ? { score: tag.query.score } : undefined,
          })),
        },
      };
    }
  }
  return raw;
}
