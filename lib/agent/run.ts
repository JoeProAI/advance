import { HEATMAP_REGIONS, findCity } from "@/lib/geo/cities";
import { createQlooClient, isHeatmapResponse } from "@/lib/qloo/client";
import { cityHeatmapParams } from "@/lib/qloo/request";
import { harnessLabel } from "@/lib/qloo/workflows";
import type { QlooEntity, QlooEntitiesResponse, QlooHeatmapCell, QlooHeatmapResponse } from "@/lib/qloo/types";
import { assignDates, nightsOnRoad, selectAndRoute } from "@/lib/routing/plan";
import { createId } from "@/lib/utils";
import { resolveWriter, writeBrief, writeSummary } from "@/lib/agent/write";
import type {
  ActKind,
  AgentStep,
  CandidateCity,
  OpenerPick,
  PlanRequest,
  PromoBrief,
  ResolvedAct,
  RoutedStop,
  RoutedTour,
  TourPlan,
  VenuePick,
} from "@/lib/types";

export type RunHooks = {
  onStep?: (step: AgentStep) => Promise<void> | void;
};

function step(
  title: string,
  detail: string,
  endpoint?: string,
  status: AgentStep["status"] = "done",
): AgentStep {
  return {
    id: createId("step"),
    at: Date.now(),
    title,
    detail,
    endpoint,
    status,
  };
}

function roomFromPopularity(popularity: number, tier: PlanRequest["budgetTier"]): string {
  if (tier === "rooms" || popularity < 0.35) {
    return "estimate: 150–400 cap";
  }
  if (tier === "theaters" || popularity > 0.7) {
    return "estimate: 600–1,200 cap";
  }
  return "estimate: 300–700 cap";
}

function kindFromSubtype(subtype: string | undefined, fallback: ActKind): ActKind {
  if (subtype?.includes("person")) {
    return "person";
  }
  if (subtype?.includes("artist")) {
    return "artist";
  }
  return fallback;
}

function asNumber(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function explain(entity: QlooEntity, actName: string, cityName: string): string {
  const parts: string[] = [cityName];
  const kind = entity.properties?.place_kind;
  if (kind) {
    parts.push(kind);
  }
  const capacity = entity.properties?.capacity;
  if (typeof capacity === "number") {
    parts.push(`${capacity} cap`);
  }
  const affinity = entity.query?.affinity;
  if (typeof affinity === "number") {
    parts.push(`aff ${affinity.toFixed(2)}`);
  }
  const genericTags = new Set(["Music Venue", "Comedy Club", "Nightclub", "Bar", "Restaurant"]);
  const tags = (entity.properties?.tags ?? []).map((tag) => tag.name).filter(Boolean);
  const taste = tags.find((tag) => !genericTags.has(tag));
  if (taste) {
    parts.push(taste);
  }
  const signal = entity.query?.explainability?.signals?.[0];
  if (signal && typeof signal.score === "number") {
    parts.push(`overlap ${signal.score.toFixed(2)}`);
  }
  if (parts.length <= 1) {
    return `matched to ${actName}'s audience in ${cityName}`;
  }
  return parts.join(" · ");
}

async function resolveTagId(
  client: ReturnType<typeof createQlooClient>,
  query: string,
): Promise<string | undefined> {
  const tags = await client.tags(query);
  const hit = tags.results.tags.find((tag) => {
    const id = tag.id ?? tag.tag_id;
    return Boolean(id?.startsWith("urn:tag:"));
  });
  return hit?.id ?? hit?.tag_id;
}

function cellsToCities(cells: QlooHeatmapCell[]): CandidateCity[] {
  const byName = new Map<string, CandidateCity>();
  for (const cell of cells) {
    const name = cell.location.name ?? "";
    const known = name ? findCity(name) : undefined;
    const city: CandidateCity = {
      name: known?.name ?? name ?? "Unknown",
      region: known?.region ?? cell.location.admin1_region ?? "US",
      country: known?.country ?? "US",
      lat: known?.lat ?? cell.location.latitude,
      lon: known?.lon ?? cell.location.longitude,
      affinity: cell.query.affinity,
      affinityRank: cell.query.affinity_rank,
      popularity: cell.query.popularity,
    };
    if (!city.name || city.name === "Unknown") {
      continue;
    }
    const existing = byName.get(city.name);
    if (!existing || existing.affinity < city.affinity) {
      byName.set(city.name, city);
    }
  }
  return [...byName.values()];
}

function citiesFromInsights(raw: QlooEntitiesResponse | QlooHeatmapResponse): CandidateCity[] {
  if (isHeatmapResponse(raw)) {
    return cellsToCities(raw.results.heatmap);
  }
  const byName = new Map<string, CandidateCity>();
  for (const entity of raw.results.entities) {
    const name = entity.properties?.geocode?.name ?? entity.name;
    const known = name ? findCity(name) : undefined;
    if (!name) {
      continue;
    }
    const city: CandidateCity = {
      name: known?.name ?? name,
      region: known?.region ?? entity.properties?.geocode?.admin1_region ?? "US",
      country: known?.country ?? "US",
      lat: known?.lat ?? entity.properties?.geocode?.latitude ?? 0,
      lon: known?.lon ?? entity.properties?.geocode?.longitude ?? 0,
      affinity: asNumber(entity.query?.affinity, 0.5),
      affinityRank: asNumber(entity.query?.affinity_rank, 0.5),
      popularity: asNumber(entity.properties?.popularity ?? entity.popularity, 0.4),
    };
    const existing = byName.get(city.name);
    if (!existing || existing.affinity < city.affinity) {
      byName.set(city.name, city);
    }
  }
  return [...byName.values()];
}

async function pickVenue(
  client: ReturnType<typeof createQlooClient>,
  act: ResolvedAct,
  cityName: string,
  tagId: string | undefined,
  request: PlanRequest,
): Promise<VenuePick> {
  const popularity =
    request.budgetTier === "rooms"
      ? { "filter.popularity.max": 0.55 }
      : request.budgetTier === "theaters"
        ? { "filter.popularity.min": 0.4 }
        : {};
  const raw = await client.insights({
    "filter.type": "urn:entity:place",
    ...(tagId ? { "filter.tags": tagId } : {}),
    "filter.location.query": cityName,
    "signal.interests.entities": act.entityId,
    "feature.explainability": true,
    take: 8,
    ...popularity,
  });
  if (isHeatmapResponse(raw) || raw.results.entities.length === 0) {
    return {
      entityId: "thin",
      name: "Hold",
      city: cityName,
      affinity: 0,
      popularity: 0,
      estimatedRoom: "estimate unavailable",
      why: "Qloo returned no venue-tagged places for this city.",
      tags: [],
    };
  }
  const entity = raw.results.entities[0]!;
  const popularityScore = asNumber(entity.properties?.popularity ?? entity.popularity, 0.3);
  const capacity = entity.properties?.capacity;
  const kind = entity.properties?.place_kind;
  const estimatedRoom =
    typeof capacity === "number"
      ? `${capacity}-cap ${kind ?? "room"}`
      : roomFromPopularity(popularityScore, request.budgetTier);
  return {
    entityId: entity.entity_id,
    name: entity.name,
    city: cityName,
    affinity: asNumber(entity.query?.affinity, 0.5),
    popularity: popularityScore,
    estimatedRoom,
    why: explain(entity, act.name, cityName),
    tags: (entity.properties?.tags ?? []).map((tag) => tag.name),
  };
}

async function pickOpeners(
  client: ReturnType<typeof createQlooClient>,
  act: ResolvedAct,
  cityName: string,
): Promise<OpenerPick[]> {
  const type = act.kind === "person" ? "urn:entity:person" : "urn:entity:artist";
  const raw = await client.insights({
    "filter.type": type,
    "signal.interests.entities": act.entityId,
    "signal.location.query": cityName,
    "filter.popularity.max": 0.45,
    take: 6,
  });
  if (isHeatmapResponse(raw)) {
    return [];
  }
  const entities = raw.results.entities.slice(0, 2);
  const compared = await Promise.all(
    entities.map((entity) => client.compare([act.entityId], [entity.entity_id])),
  );
  return entities.map((entity, index) => {
    const overlap = compared[index]?.results.overlap ?? 0;
    const affinity = asNumber(entity.query?.affinity, 0.5);
    const note = entity.properties?.description ?? `local ${act.kind === "person" ? "comic" : "act"}`;
    return {
      entityId: entity.entity_id,
      name: entity.name,
      kind: act.kind,
      affinity,
      popularity: asNumber(entity.properties?.popularity ?? entity.popularity, 0.15),
      overlap,
      why: `${entity.name} in ${cityName}: overlap ${overlap.toFixed(2)} · affinity ${affinity.toFixed(2)} · ${note}`,
    };
  });
}

async function promoFacts(
  client: ReturnType<typeof createQlooClient>,
  act: ResolvedAct,
  cityName: string,
  sharedTags: string[],
): Promise<{ podcasts: string[]; bars: string[]; brands: string[]; tags: string[] }> {
  const barTag = await resolveTagId(client, "bar");
  const [podcastsRaw, barsRaw, brandsRaw] = await Promise.all([
    client.insights({
      "filter.type": "urn:entity:podcast",
      "signal.interests.entities": act.entityId,
      "signal.location.query": cityName,
      take: 4,
    }),
    client.insights({
      "filter.type": "urn:entity:place",
      ...(barTag ? { "filter.tags": barTag } : {}),
      "filter.location.query": cityName,
      "signal.interests.entities": act.entityId,
      take: 4,
    }),
    client.insights({
      "filter.type": "urn:entity:brand",
      "signal.interests.entities": act.entityId,
      "signal.location.query": cityName,
      take: 4,
    }),
  ]);
  const names = (raw: typeof podcastsRaw) =>
    isHeatmapResponse(raw) ? [] : raw.results.entities.map((entity) => entity.name);
  return {
    podcasts: names(podcastsRaw),
    bars: names(barsRaw),
    brands: names(brandsRaw),
    tags: sharedTags,
  };
}

export async function runTourAgent(
  request: PlanRequest,
  hooks: RunHooks = {},
): Promise<Omit<TourPlan, "id" | "createdAt" | "updatedAt">> {
  const client = createQlooClient();
  const writer = resolveWriter();
  const steps: AgentStep[] = [];
  const emit = async (next: AgentStep) => {
    steps.push(next);
    await hooks.onStep?.(next);
  };

  await emit(
    step(
      "Resolving the act",
      `Searching Qloo for “${request.actName}”.`,
      `GET /search · ${harnessLabel("describe")}`,
    ),
  );
  const searchTypes =
    request.kindHint === "person" ? "urn:entity:person" : "urn:entity:artist,urn:entity:person";
  const found = await client.search({ query: request.actName, types: searchTypes, take: 5 });
  const hit = found.results.entities[0];
  if (!hit) {
    await emit(step("Act not found", "Search returned no entities.", "GET /search", "error"));
    return {
      status: "error",
      request,
      act: null,
      steps,
      route: null,
      summary: "",
      error: `No Qloo entity for “${request.actName}”. Try a clearer name.`,
      qlooMode: client.mode,
      writer,
      thinData: true,
    };
  }

  await emit(step("Loading entity details", hit.name, `GET /entities · ${harnessLabel("describe")}`));
  const details = await client.entities([hit.entity_id]);
  const entity = details.results.entities[0] ?? hit;
  await emit(
    step(
      "Checking momentum",
      "Week-over-week via /trends/entity.",
      `GET /trends/entity · ${harnessLabel("trends")}`,
    ),
  );
  const trend = await client.trends(entity.entity_id);
  const act: ResolvedAct = {
    entityId: entity.entity_id,
    name: entity.name,
    kind: kindFromSubtype(entity.subtype, request.kindHint ?? "artist"),
    description: entity.properties?.description ?? "",
    popularity: asNumber(entity.properties?.popularity ?? entity.popularity, 0.3),
    trend: {
      available: trend.results.available,
      delta: trend.results.delta,
      note: trend.results.note,
    },
  };

  await emit(
    step(
      `Finding where fans of ${act.name} cluster`,
      `City-level heatmaps over ${HEATMAP_REGIONS.length} regions.`,
      `GET /v2/insights?filter.type=urn:entity:destination&output.heatmap.boundary=city · ${harnessLabel("where_popular")}`,
    ),
  );
  const byCity = new Map<string, CandidateCity>();
  for (const region of HEATMAP_REGIONS) {
    const heat = await client.insights(
      cityHeatmapParams({ entityId: act.entityId, locationQuery: region.query, take: 20 }),
    );
    for (const city of citiesFromInsights(heat)) {
      const existing = byCity.get(city.name);
      if (!existing || existing.affinity < city.affinity) {
        byCity.set(city.name, city);
      }
    }
  }
  const candidates = [...byCity.values()].sort((a, b) => b.affinity - a.affinity);
  if (candidates.length === 0) {
    await emit(
      step("Heatmap empty", "No city-level cells. The sheet stays blank.", undefined, "error"),
    );
    return {
      status: "error",
      request,
      act,
      steps,
      route: null,
      summary: "",
      error: "The heatmap came back empty. There is no run to route until Qloo names a city.",
      qlooMode: client.mode,
      writer,
      thinData: true,
    };
  }

  await emit(
    step(
      "Routing the run",
      `Scoring ${candidates.length} cities, then nearest-neighbor + 2-opt under a ${request.maxDriveHours}h drive cap.`,
      `route_plan · ${harnessLabel("rank")}`,
    ),
  );
  const home = request.homeCity ? findCity(request.homeCity) : undefined;
  const routed = selectAndRoute({
    candidates,
    showCount: request.showCount,
    maxDriveHours: request.maxDriveHours,
    homeCity: home,
  });
  const dates = assignDates(routed.cities.length, request.startDate);

  await emit(
    step(
      "Resolving venue tags",
      "Looking up music venue / comedy club tag IDs.",
      `GET /v2/tags · ${harnessLabel("find_tags")}`,
    ),
  );
  const venueTag = await resolveTagId(client, act.kind === "person" ? "comedy club" : "music venue");
  await emit(
    step(
      "Taste analysis",
      "Shared audience tags already on the act record, reused on every stop.",
      `GET /entities · ${harnessLabel("entity_tags")}`,
    ),
  );
  const sharedTags = (entity.properties?.tags ?? []).map((tag) => tag.name).slice(0, 8);

  const stops: RoutedStop[] = [];
  let thin = candidates.length < request.showCount;
  for (let i = 0; i < routed.cities.length; i += 1) {
    const city = routed.cities[i]!;
    await emit(
      step(
        `Scoring venues in ${city.name}`,
        venueTag ? `filter.tags=${venueTag}` : "place insights with the act as signal",
        `GET /v2/insights?filter.type=urn:entity:place · ${harnessLabel("recommend")}`,
      ),
    );
    const venue = await pickVenue(client, act, city.name, venueTag, request);
    if (venue.entityId === "thin") {
      thin = true;
    }
    await emit(
      step(
        `Local openers in ${city.name}`,
        `Emerging ${act.kind === "person" ? "comics" : "artists"} plus compare.`,
        `GET /v2/insights + /v2/insights/compare · ${harnessLabel("compare_audiences")}`,
      ),
    );
    const openers = await pickOpeners(client, act, city.name);
    await emit(
      step(
        `Promo brief for ${city.name}`,
        "Podcasts, bars, brands, and taste tags.",
        `GET /v2/insights (podcast, place, brand) · ${harnessLabel("recommend")}`,
      ),
    );
    const promo = await promoFacts(client, act, city.name, sharedTags);
    const brief: PromoBrief = await writeBrief({
      act,
      city: city.name,
      venue: venue.name,
      venueWhy: venue.why,
      openers,
      podcasts: promo.podcasts,
      bars: promo.bars,
      brands: promo.brands,
      tags: promo.tags,
      affinity: city.affinity,
    });
    stops.push({
      order: i + 1,
      date: dates[i]!,
      city,
      affinity: city.affinity,
      affinityRank: city.affinityRank,
      venue,
      openers,
      overlap: openers[0]?.overlap ?? 0,
      brief,
      driveHoursFromPrev: city.driveHoursFromPrev,
      milesFromPrev: city.milesFromPrev,
    });
  }

  const route: RoutedTour = {
    stops,
    totalMiles: routed.totalMiles,
    totalDriveHours: routed.totalDriveHours,
    nights: nightsOnRoad(dates),
  };
  const summary = await writeSummary(act, stops);
  await emit(
    step("Tour desk closed", "The last call is in. The plate is ready to tear."),
  );

  return {
    status: "ready",
    request,
    act,
    steps,
    route,
    summary,
    qlooMode: client.mode,
    writer,
    thinData: thin,
  };
}
