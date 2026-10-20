/**
 * Mock Qloo client. Builds hand-written synthetic payloads in the live
 * response shapes (plain `results` arrays for search, unnamed heatmap cells,
 * scored compare tags) and runs them through the same parsers as live mode.
 */
import { findCity } from "@/lib/geo/cities";
import { overlapFromCompare, parseEntityList, parseHeatmapCells, parseTags } from "@/lib/qloo/parse";
import type {
  QlooCompareResponse,
  QlooEntitiesResponse,
  QlooEntity,
  QlooHeatmapCell,
  QlooHeatmapResponse,
  QlooInsightsParams,
  QlooSearchParams,
  QlooTagsResponse,
  QlooTrendsResponse,
} from "@/lib/qloo/types";
import {
  KIND_TAG,
  SYNTHETIC_TAGS,
  actByEntityId,
  affinityForCity,
  citiesForAct,
  compareOverlap,
  geohashStub,
  nickForCity,
  openersFor,
  promoFor,
  resolveSyntheticAct,
  syntheticEntityId,
  venuesFor,
  type SyntheticAct,
} from "@/lib/qloo/fixtures";

function sleep(): Promise<void> {
  return Promise.resolve();
}

function rawActEntity(act: SyntheticAct): QlooEntity {
  return {
    name: act.name,
    entity_id: act.entityId,
    types: [act.kind === "person" ? "urn:entity:person" : "urn:entity:artist"],
    popularity: act.popularity,
    disambiguation: "synthetic mock entity",
    tags: act.taste.map((tag, i) => ({
      tag_id: `urn:tag:genre:mock:${act.slug}:${i}`,
      name: tag,
      type: "urn:tag:genre:mock",
    })),
    properties: { short_description: act.description },
  };
}

export async function mockSearch(params: QlooSearchParams): Promise<QlooEntitiesResponse> {
  await sleep();
  const types = params.types ?? "";
  const kindHint = types.includes("person") && !types.includes("artist") ? "person" : "artist";
  const act = resolveSyntheticAct(params.query, kindHint);
  return parseEntityList({ results: [rawActEntity(act)] });
}

export async function mockEntities(entityIds: string[]): Promise<QlooEntitiesResponse> {
  await sleep();
  return parseEntityList({ results: entityIds.map((id) => rawActEntity(actByEntityId(id))) });
}

/**
 * Unnamed geohash-style cells, like live `urn:heatmap`: a few near each
 * fixture city plus rural noise cells (affinity 1, low popularity) that sit
 * far from any tour city.
 */
function heatmapCellsFor(act: SyntheticAct): QlooHeatmapResponse {
  const cells: QlooHeatmapCell[] = [];
  act.cityNames.forEach((name, index) => {
    const city = findCity(name);
    if (!city) {
      return;
    }
    const base = affinityForCity(act, city, index);
    for (const [dLat, dLon, damp] of [
      [0.04, -0.05, 1],
      [-0.12, 0.1, 0.82],
    ] as const) {
      const lat = city.lat + dLat;
      const lon = city.lon + dLon;
      cells.push({
        location: { latitude: lat, longitude: lon, geohash: geohashStub(lat, lon) },
        query: {
          affinity: Math.min(1, base * damp + 0.02),
          affinity_rank: Math.max(0.1, 0.96 - index * 0.04),
          popularity: Math.max(0.2, (0.95 - index * 0.05) * damp),
        },
      });
    }
  });
  for (const [lat, lon] of [
    [44.1, -103.2],
    [31.2, -100.4],
    [47.5, -100.9],
  ] as const) {
    cells.push({
      location: { latitude: lat, longitude: lon, geohash: geohashStub(lat, lon) },
      query: { affinity: 1, affinity_rank: 0.99, popularity: 0.04 },
    });
  }
  return { success: true, results: { heatmap: parseHeatmapCells({ results: { heatmap: cells } }) } };
}

const SIZE_TAG: Record<string, { id: string; name: string; type: string }> = {
  room: SYNTHETIC_TAGS.intimate,
  club: SYNTHETIC_TAGS.intimate,
  theater: { id: "urn:tag:category:place:performing_arts_theater", name: "Performing arts theater", type: "urn:tag:category:place" },
  warehouse: SYNTHETIC_TAGS.nightClub,
};

export async function mockInsights(params: QlooInsightsParams): Promise<QlooEntitiesResponse | QlooHeatmapResponse> {
  await sleep();
  const type = String(params["filter.type"] ?? "");
  const signal = String(params["signal.interests.entities"] ?? "");
  const act = actByEntityId(signal || "unknown");
  const location =
    String(params["filter.location.query"] ?? params["signal.location.query"] ?? "").split(",")[0] ?? "";
  const empty = parseEntityList({ success: true, results: { entities: [] } });

  if (type === "urn:heatmap") {
    return heatmapCellsFor(act);
  }

  if (type === "urn:entity:place") {
    const cityName = location;
    if (!cityName || !act.cityNames.includes(cityName)) {
      return empty;
    }
    const tag = String(params["filter.tags"] ?? "");
    const city = findCity(cityName);
    const geocode = { name: nickForCity(cityName), city: cityName, admin1_region: city?.region, country_code: "US" };
    if (tag === SYNTHETIC_TAGS.bar.id) {
      const promo = promoFor(act, cityName);
      return parseEntityList({
        success: true,
        results: {
          entities: promo.bars.map((name, i) => ({
            name,
            entity_id: syntheticEntityId("5555", `${act.slug}:${cityName}:bar:${i}`),
            type: "urn:entity",
            subtype: "urn:entity:place",
            popularity: 0.9 - i * 0.03,
            tags: [SYNTHETIC_TAGS.bar],
            properties: { geocode, price_level: 1 },
            query: { affinity: 0.7 - i * 0.05 },
          })),
        },
      });
    }
    const explain = params["feature.explainability"] === "true" || params["feature.explainability"] === true;
    const entities = venuesFor(act, cityName).map((room, i) => ({
      name: room.name,
      entity_id: syntheticEntityId("3333", `${act.slug}:${cityName}:venue:${i}:${room.name}`),
      type: "urn:entity",
      subtype: "urn:entity:place",
      popularity: Math.min(0.99, 0.86 + (room.capacity % 13) / 100),
      location: { lat: city?.lat, lon: city?.lon, geohash: geohashStub(city?.lat ?? 0, city?.lon ?? 0) },
      tags: [
        KIND_TAG[room.kind],
        SIZE_TAG[room.kind],
        { id: `urn:tag:ambience:qloo:${act.slug}-${i}`, name: room.tags[1] ?? "Classic", type: "urn:tag:ambience:qloo" },
      ].filter(Boolean),
      properties: {
        geocode,
        price_level: 1 + (i % 2),
        short_description: `${room.kind} in ${nickForCity(cityName)}. Synthetic mock venue.`,
      },
      query: {
        affinity: Math.max(0.4, 0.91 - i * 0.08 + ((room.capacity % 17) - 8) / 200),
        ...(explain
          ? {
              explainability: {
                "signal.interests.entities": [
                  { entity_id: act.entityId, score: compareOverlap(act.entityId, `${cityName}:${room.name}`) },
                ],
              },
            }
          : {}),
      },
    }));
    return parseEntityList({ success: true, results: { entities } });
  }

  if (type === "urn:entity:artist" || type === "urn:entity:person") {
    // With a location: that city's synthetic openers. Without one (the
    // tour-wide opener pool): every city's openers, each with a synthetic
    // bio naming its home city so the local boost has something to read.
    const cityNames = location ? (act.cityNames.includes(location) ? [location] : []) : act.cityNames;
    const entities = cityNames.flatMap((cityName) =>
      openersFor(act, cityName).map((opener, i) => {
        const home = findCity(cityName);
        return {
          name: opener.name,
          entity_id: syntheticEntityId("4444", `${act.slug}:${cityName}:opener:${opener.name}`),
          type: "urn:entity",
          subtype: type,
          popularity: 0.11 + i * 0.05 + (opener.name.length % 7) / 100,
          properties: {
            short_description: opener.note,
            biography: `Synthetic act formed in ${cityName}${home ? `, ${home.region}` : ""}.`,
          },
          query: { affinity: 0.82 - i * 0.07 + (opener.name.length % 5) / 100 },
        };
      }),
    );
    return parseEntityList({ success: true, results: { entities } });
  }

  if (type === "urn:entity:podcast" || type === "urn:entity:brand") {
    const cityName = location;
    if (!cityName || !act.cityNames.includes(cityName)) {
      return empty;
    }
    const promo = promoFor(act, cityName);
    const names = type === "urn:entity:podcast" ? promo.podcasts : promo.brands;
    return parseEntityList({
      success: true,
      results: {
        entities: names.map((name, i) => ({
          name,
          entity_id: syntheticEntityId("5555", `${act.slug}:${cityName}:${type}:${name}`),
          type: "urn:entity",
          subtype: type,
          query: { affinity: 0.74 - i * 0.06 },
        })),
      },
    });
  }

  return empty;
}

export async function mockTags(query: string): Promise<QlooTagsResponse> {
  await sleep();
  const all = Object.values(SYNTHETIC_TAGS);
  const q = query.toLowerCase();
  const tags = q
    ? all.filter((tag) => tag.name.toLowerCase().includes(q) || tag.id.includes(q.replace(/\s+/g, "_")))
    : all;
  return { success: true, results: { tags: parseTags({ results: { tags } }) } };
}

/** Raw compare shape (scored shared tags), read with the live parser. */
export async function mockCompare(a: string[], b: string[]): Promise<QlooCompareResponse> {
  await sleep();
  const left = a[0] ?? "";
  const right = b[0] ?? "";
  const top = compareOverlap(left, right);
  const pool = ["Indie Rock", "Alt Country", "Storytelling", "Late Night", "College Radio", "Observational"];
  const start = Math.abs(left.length + right.length) % pool.length;
  const tags = [0, 1, 2, 3, 4, 5].map((i) => ({
    tag_id: `urn:tag:genre:mock:${i}`,
    name: pool[(start + i) % pool.length]!,
    query: { score: Math.max(0, top - i * 0.01) },
  }));
  return { success: true, results: overlapFromCompare({ results: { tags } }) };
}

export async function mockTrends(entityId: string): Promise<QlooTrendsResponse> {
  await sleep();
  const act = actByEntityId(entityId);
  return {
    success: true,
    results: {
      available: true,
      delta: act.trendDelta,
      window: "wow",
      note: "Synthetic week-over-week figure for mock mode.",
    },
  };
}

export { citiesForAct, resolveSyntheticAct };
