import { HEATMAP_REGIONS } from "@/lib/geo/cities";
import { findCity } from "@/lib/geo/cities";
import type {
  QlooCompareResponse,
  QlooEntitiesResponse,
  QlooHeatmapResponse,
  QlooInsightsParams,
  QlooSearchParams,
  QlooTagsResponse,
  QlooTrendsResponse,
} from "@/lib/qloo/types";
import {
  SYNTHETIC_TAGS,
  actByEntityId,
  affinityForCity,
  citiesForAct,
  compareOverlap,
  geohashStub,
  openersFor,
  promoFor,
  resolveSyntheticAct,
  syntheticEntityId,
  venuesFor,
} from "@/lib/qloo/fixtures";

function sleep(): Promise<void> {
  return Promise.resolve();
}

function entityFromAct(name: string, kindHint?: "artist" | "person"): QlooEntitiesResponse {
  const act = resolveSyntheticAct(name, kindHint);
  return {
    success: true,
    results: {
      entities: [
        {
          name: act.name,
          entity_id: act.entityId,
          type: "urn:entity",
          subtype: act.kind === "person" ? "urn:entity:person" : "urn:entity:artist",
          properties: {
            description: act.description,
            popularity: act.popularity,
            tags: act.taste.map((tag, i) => ({
              id: `urn:tag:keyword:mock:${i}`,
              name: tag,
              type: "urn:tag:keyword:mock",
            })),
          },
          popularity: act.popularity,
          disambiguation: "synthetic mock entity",
        },
      ],
    },
    duration: 4,
  };
}

export async function mockSearch(params: QlooSearchParams): Promise<QlooEntitiesResponse> {
  await sleep();
  const types = params.types ?? "";
  const kindHint = types.includes("person") && !types.includes("artist") ? "person" : "artist";
  return entityFromAct(params.query, kindHint);
}

export async function mockEntities(entityIds: string[]): Promise<QlooEntitiesResponse> {
  await sleep();
  const entities = entityIds.map((id) => {
    const act = actByEntityId(id);
    return entityFromAct(act.name).results.entities[0]!;
  });
  return { success: true, results: { entities }, duration: 3 };
}

function heatmapCellsFor(
  act: ReturnType<typeof actByEntityId>,
  regionQuery: string,
): QlooHeatmapResponse {
  const region = HEATMAP_REGIONS.find((item) =>
    regionQuery.toLowerCase().includes(item.query.split(" ")[0]!.toLowerCase()),
  );
  const names = act.cityNames.filter((cityName) =>
    region ? region.cities.includes(cityName) : Boolean(regionQuery) === false,
  );
  const cells = names.map((name, index) => {
    const city = findCity(name);
    const lat = city?.lat ?? 39;
    const lon = city?.lon ?? -90;
    return {
      location: {
        latitude: lat,
        longitude: lon,
        geohash: geohashStub(lat, lon),
        name,
        admin1_region: city?.region,
      },
      query: {
        affinity: affinityForCity(act, city ?? { name, region: "NA", country: "US", lat, lon }, index),
        affinity_rank: 1 - index * 0.04,
        popularity: 0.55 + ((index * 7) % 30) / 100,
      },
    };
  });
  return { success: true, results: { heatmap: cells }, duration: 8 };
}

export async function mockInsights(params: QlooInsightsParams): Promise<QlooEntitiesResponse | QlooHeatmapResponse> {
  await sleep();
  const type = String(params["filter.type"] ?? "");
  const signal = String(params["signal.interests.entities"] ?? "");
  const act = actByEntityId(signal || "unknown");
  const location =
    String(params["filter.location.query"] ?? params["signal.location.query"] ?? "").split(",")[0] ??
    "";
  const heatmapBoundary = String(params["output.heatmap.boundary"] ?? "");

  if (heatmapBoundary) {
    return heatmapCellsFor(act, String(params["filter.location.query"] ?? params["filter.location"] ?? ""));
  }

  if (type === "urn:entity:destination") {
    const heat = heatmapCellsFor(act, String(params["filter.location.query"] ?? params["filter.location"] ?? ""));
    return {
      success: true,
      results: {
        entities: heat.results.heatmap.map((cell, i) => ({
          name: cell.location.name ?? "Unknown",
          entity_id: syntheticEntityId("2222", `${act.slug}:destination:${cell.location.name}:${i}`),
          type: "urn:entity",
          subtype: "urn:entity:destination",
          properties: {
            geocode: {
              name: cell.location.name,
              latitude: cell.location.latitude,
              longitude: cell.location.longitude,
              admin1_region: cell.location.admin1_region,
            },
            popularity: cell.query.popularity,
          },
          query: {
            affinity: cell.query.affinity,
            affinity_rank: cell.query.affinity_rank,
            popularity: cell.query.popularity,
          },
        })),
      },
      duration: 8,
    };
  }

  if (type === "urn:entity:place") {
    const cityName = location;
    if (!cityName || !act.cityNames.includes(cityName)) {
      return { success: true, results: { entities: [] }, duration: 2 };
    }
    const tag = String(params["filter.tags"] ?? "");
    const isBar = tag.includes("bar") || tag.includes("urn:tag:genre:place:bar");
    if (isBar) {
      const promo = promoFor(act, cityName);
      return {
        success: true,
        results: {
          entities: promo.bars.map((name, i) => ({
            name,
            entity_id: syntheticEntityId("5555", `${act.slug}:${cityName}:bar:${i}`),
            type: "urn:entity",
            subtype: "urn:entity:place",
            properties: {
              geocode: { name: cityName, city: cityName },
              popularity: 0.22 + i * 0.06,
              tags: [SYNTHETIC_TAGS.bar],
            },
            query: { affinity: 0.7 - i * 0.05 },
          })),
        },
        duration: 5,
      };
    }
    const rooms = venuesFor(act, cityName);
    const entities = rooms.map((room, i) => {
      const affinity = Math.max(0.4, 0.91 - i * 0.08 + ((room.capacity % 17) - 8) / 200);
      return {
        name: room.name,
        entity_id: syntheticEntityId("3333", `${act.slug}:${cityName}:venue:${i}:${room.name}`),
        type: "urn:entity",
        subtype: "urn:entity:place",
        properties: {
          geocode: {
            name: cityName,
            city: cityName,
            latitude: findCity(cityName)?.lat,
            longitude: findCity(cityName)?.lon,
          },
          popularity: Math.min(0.9, room.capacity / 1400),
          capacity: room.capacity,
          place_kind: room.kind,
          tags: room.tags.map((name, tagIndex) => ({
            id: `urn:tag:keyword:mock:${act.slug}:${cityName}:${tagIndex}`,
            name,
            type: "urn:tag:keyword:mock",
          })),
        },
        query: {
          affinity,
          explainability: {
            signals: [
              {
                name: act.name,
                score: compareOverlap(act.entityId, `${cityName}:${room.name}`),
              },
            ],
          },
        },
      };
    });
    return { success: true, results: { entities }, duration: 6 };
  }

  if (type === "urn:entity:artist" || type === "urn:entity:person") {
    const cityName = location;
    if (!cityName || !act.cityNames.includes(cityName)) {
      return { success: true, results: { entities: [] }, duration: 2 };
    }
    const openers = openersFor(act, cityName);
    const entities = openers.map((opener, i) => ({
      name: opener.name,
      entity_id: syntheticEntityId("4444", `${act.slug}:${cityName}:opener:${opener.name}`),
      type: "urn:entity",
      subtype: type,
      properties: {
        popularity: 0.11 + i * 0.05 + (opener.name.length % 7) / 100,
        description: opener.note,
      },
      query: { affinity: 0.82 - i * 0.07 + (opener.name.length % 5) / 100 },
    }));
    return { success: true, results: { entities }, duration: 6 };
  }

  if (type === "urn:entity:podcast" || type === "urn:entity:brand") {
    const cityName = location;
    if (!cityName || !act.cityNames.includes(cityName)) {
      return { success: true, results: { entities: [] }, duration: 2 };
    }
    const promo = promoFor(act, cityName);
    const names = type === "urn:entity:podcast" ? promo.podcasts : promo.brands;
    return {
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
      duration: 5,
    };
  }

  return { success: true, results: { entities: [] }, duration: 2 };
}

export async function mockTags(query: string): Promise<QlooTagsResponse> {
  await sleep();
  const all = Object.values(SYNTHETIC_TAGS);
  const q = query.toLowerCase();
  const tags = q
    ? all.filter((tag) => tag.name.toLowerCase().includes(q) || tag.id.includes(q.replace(/\s+/g, "_")))
    : all;
  return { success: true, results: { tags } };
}

export async function mockCompare(a: string[], b: string[]): Promise<QlooCompareResponse> {
  await sleep();
  const left = a[0] ?? "";
  const right = b[0] ?? "";
  const overlap = compareOverlap(left, right);
  const tagPool = ["night crowds", "regional rooms", "college radio", "late sets", "city weeklies", "story songs"];
  const start = Math.abs(left.length + right.length) % tagPool.length;
  return {
    success: true,
    results: {
      overlap,
      shared_tags: [tagPool[start]!, tagPool[(start + 2) % tagPool.length]!],
      note: "Synthetic overlap. Not computed from Qloo.",
    },
  };
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
