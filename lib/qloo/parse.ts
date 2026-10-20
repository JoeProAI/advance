/**
 * Readers for live Qloo hackathon response shapes (probed Oct 20, 2026).
 *
 * - `/search` and `/entities` return `results` as a plain array.
 * - `/v2/insights` returns `results.entities[]` or, for `urn:heatmap`,
 *   `results.heatmap[]` cells with no place names.
 * - `/v2/insights/compare` returns scored shared `results.tags[]`; there is
 *   no `overlap` field, so Advance derives one.
 * - Tags live on `entity.tags[]`; search hits use `types[]`, insights hits use
 *   `subtype`.
 */
import { US_CITIES } from "@/lib/geo/cities";
import { haversineMiles } from "@/lib/routing/plan";
import type {
  QlooCompareRaw,
  QlooCompareResult,
  QlooEntitiesResponse,
  QlooEntity,
  QlooHeatmapCell,
  QlooTag,
} from "@/lib/qloo/types";
import type { ActKind, CandidateCity, City } from "@/lib/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEntity(value: unknown): value is QlooEntity {
  return isRecord(value) && typeof value.entity_id === "string" && typeof value.name === "string";
}

/** Accepts `{results: [...]}`, `{results: {entities: [...]}}`, or a bare array. */
export function parseEntityList(raw: unknown): QlooEntitiesResponse {
  let list: unknown[] = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (isRecord(raw)) {
    const results = raw.results;
    if (Array.isArray(results)) {
      list = results;
    } else if (isRecord(results) && Array.isArray(results.entities)) {
      list = results.entities;
    }
  }
  return {
    success: isRecord(raw) && raw.success === false ? false : true,
    results: { entities: list.filter(isEntity) },
  };
}

export function parseHeatmapCells(raw: unknown): QlooHeatmapCell[] {
  if (!isRecord(raw) || !isRecord(raw.results) || !Array.isArray(raw.results.heatmap)) {
    return [];
  }
  return raw.results.heatmap.filter((cell): cell is QlooHeatmapCell => {
    if (!isRecord(cell) || !isRecord(cell.location) || !isRecord(cell.query)) {
      return false;
    }
    return (
      typeof cell.location.latitude === "number" &&
      typeof cell.location.longitude === "number" &&
      typeof cell.query.affinity === "number"
    );
  });
}

export function parseTags(raw: unknown): QlooTag[] {
  if (!isRecord(raw)) {
    return [];
  }
  const results = raw.results;
  const list = Array.isArray(results) ? results : isRecord(results) && Array.isArray(results.tags) ? results.tags : [];
  return list.filter((tag): tag is QlooTag => isRecord(tag) && typeof tag.name === "string");
}

export function tagId(tag: QlooTag): string | undefined {
  return tag.id ?? tag.tag_id;
}

/** Tags on a live entity are top-level; older mock shapes nested them. */
export function entityTags(entity: QlooEntity): QlooTag[] {
  const nested = (entity.properties as { tags?: QlooTag[] } | undefined)?.tags;
  return entity.tags ?? nested ?? [];
}

export function entityDescription(entity: QlooEntity): string {
  return entity.properties?.short_description ?? entity.properties?.description ?? "";
}

export function entityPopularity(entity: QlooEntity, fallback: number): number {
  const value = entity.popularity ?? entity.query?.popularity;
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** Search hits carry `types[]`; insights hits carry `subtype`. */
export function entityKind(entity: QlooEntity, fallback: ActKind): ActKind {
  const all = [...(entity.types ?? []), entity.subtype ?? "", entity.type ?? ""].join(" ");
  if (all.includes("urn:entity:person")) {
    return "person";
  }
  if (all.includes("urn:entity:artist")) {
    return "artist";
  }
  return fallback;
}

/** Score for `entityId` in `query.explainability["signal.interests.entities"]`. */
export function explainScore(entity: QlooEntity, entityId?: string): number | undefined {
  const rows = entity.query?.explainability?.["signal.interests.entities"];
  if (!Array.isArray(rows) || rows.length === 0) {
    return undefined;
  }
  const row = (entityId ? rows.find((item) => item.entity_id === entityId) : undefined) ?? rows[0];
  return typeof row?.score === "number" ? row.score : undefined;
}

/**
 * Compare has no overlap number. Advance reads the mean of the top five shared
 * tag scores, clamped to 0..1. No shared tags means 0.
 */
export function overlapFromCompare(raw: unknown): QlooCompareResult {
  const tags = (raw as QlooCompareRaw)?.results?.tags;
  if (!Array.isArray(tags) || tags.length === 0) {
    return { overlap: 0, shared_tags: [], note: "Compare returned no shared tags." };
  }
  const scored = tags
    .map((tag) => ({ name: tag.name, score: Number(tag.query?.score) }))
    .filter((tag) => typeof tag.name === "string" && Number.isFinite(tag.score))
    .sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 5);
  if (top.length === 0) {
    return { overlap: 0, shared_tags: [], note: "Compare tags carried no scores." };
  }
  const mean = top.reduce((sum, tag) => sum + tag.score, 0) / top.length;
  return {
    overlap: Math.max(0, Math.min(1, mean)),
    shared_tags: top.map((tag) => tag.name),
    note: `Mean of the top ${top.length} shared tag scores from /v2/insights/compare.`,
  };
}

/** True when the entity has no coordinates or sits within `miles` of the city. */
export function withinMiles(entity: QlooEntity, city: City, miles: number): boolean {
  const lat = entity.location?.lat;
  const lon = entity.location?.lon;
  if (typeof lat !== "number" || typeof lon !== "number") {
    return true;
  }
  return haversineMiles({ lat, lon }, city) <= miles;
}

export const HEATMAP_CITY_RADIUS_MILES = 40;

/**
 * Heatmap cells are unnamed geohash tiles. Assign each cell to the nearest
 * known city within the radius, keep the best cell per city, and score it as
 * affinity x cell popularity (affinity alone saturates at 1 across many rural
 * cells, so it cannot rank cities on its own).
 */
export function cellsToCities(
  cells: QlooHeatmapCell[],
  cities: City[] = US_CITIES,
  radiusMiles = HEATMAP_CITY_RADIUS_MILES,
): CandidateCity[] {
  const best = new Map<string, CandidateCity & { score: number }>();
  for (const cell of cells) {
    const point = { lat: cell.location.latitude, lon: cell.location.longitude };
    let nearest: City | undefined;
    let nearestMiles = Infinity;
    for (const city of cities) {
      const miles = haversineMiles(point, city);
      if (miles < nearestMiles) {
        nearest = city;
        nearestMiles = miles;
      }
    }
    if (!nearest || nearestMiles > radiusMiles) {
      continue;
    }
    const popularity = Number.isFinite(cell.query.popularity) ? cell.query.popularity : 0;
    const score = cell.query.affinity * popularity;
    const existing = best.get(nearest.name);
    if (!existing || existing.score < score) {
      best.set(nearest.name, {
        ...nearest,
        affinity: score,
        affinityRank: cell.query.affinity_rank,
        popularity,
        score,
      });
    }
  }
  return [...best.values()]
    .sort((a, b) => b.score - a.score)
    .map((city) => {
      const { score, ...rest } = city;
      void score;
      return rest;
    });
}

/**
 * Keep one city per market: drop a candidate within `miles` of a better one
 * (Brooklyn next to New York). Input must be sorted best first.
 */
export function dedupeMarkets(cities: CandidateCity[], miles = 20): CandidateCity[] {
  const kept: CandidateCity[] = [];
  for (const city of cities) {
    if (!kept.some((other) => haversineMiles(other, city) < miles)) {
      kept.push(city);
    }
  }
  return kept;
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/^the\s+/, "")
    .replace(/[.'’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export type SearchMatch =
  | { ok: true; entity: QlooEntity }
  | { ok: false; suggestions: string[] };

/**
 * "Did you mean" guard. Qloo search always returns its closest hits, even for
 * a typo or an unknown act. Only route when a hit's name matches what was
 * typed (case, accents, punctuation, and a leading "The" ignored).
 */
export function matchSearchHit(query: string, hits: QlooEntity[]): SearchMatch {
  const needle = normalizeName(query);
  const exact = hits.find((hit) => normalizeName(hit.name) === needle);
  if (exact && needle) {
    return { ok: true, entity: exact };
  }
  const suggestions = [...new Set(hits.map((hit) => hit.name))].slice(0, 3);
  return { ok: false, suggestions };
}
