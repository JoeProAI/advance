import { findCity } from "@/lib/geo/cities";
import { pickByTier, roomSize } from "@/lib/agent/rooms";
import { createQlooClient, isHeatmapResponse } from "@/lib/qloo/client";
import { isAuthOrTypeError } from "@/lib/qloo/errors";
import {
  cellsToCities,
  entityDescription,
  entityKind,
  entityPopularity,
  entityTags,
  explainScore,
  matchSearchHit,
} from "@/lib/qloo/parse";
import { PLACE_TAGS, cityHeatmapParams } from "@/lib/qloo/request";
import { harnessLabel } from "@/lib/qloo/workflows";
import type { QlooEntitiesResponse, QlooEntity } from "@/lib/qloo/types";
import { assignDates, nightsOnRoad, selectAndRoute } from "@/lib/routing/plan";
import { createId } from "@/lib/utils";
import { resolveWriter, writeBrief, writeSummary } from "@/lib/agent/write";
import type {
  AgentStep,
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

function asNumber(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

type Client = ReturnType<typeof createQlooClient>;
type Emit = (next: AgentStep) => Promise<void>;

const GENERIC_AMBIENCE = new Set(["Casual", "Social", "Lively", "Place", "Tourist attraction"]);
const VENUE_CATEGORIES = [
  "Comedy club",
  "Concert hall",
  "Performing arts theater",
  "Live music bar",
  "Live music venue",
  "Night club",
  "Event venue",
];

function explain(entity: QlooEntity, act: ResolvedAct, cityName: string): string {
  const parts: string[] = [cityName];
  const neighborhood = entity.properties?.geocode?.name;
  if (neighborhood && neighborhood !== cityName) {
    parts.push(neighborhood);
  }
  const tags = entityTags(entity);
  const names = new Set(tags.map((tag) => tag.name));
  const category = VENUE_CATEGORIES.find((name) => names.has(name));
  if (category) {
    parts.push(category.toLowerCase());
  }
  const affinity = entity.query?.affinity;
  if (typeof affinity === "number") {
    parts.push(`aff ${affinity.toFixed(2)}`);
  }
  const taste = tags.find(
    (tag) => tag.type?.includes("ambience") && !GENERIC_AMBIENCE.has(tag.name) && !["Intimate", "Cozy"].includes(tag.name),
  );
  if (taste) {
    parts.push(taste.name);
  }
  const score = explainScore(entity, act.entityId);
  if (typeof score === "number") {
    parts.push(`explained by ${act.name} ${score.toFixed(2)}`);
  }
  if (parts.length <= 1) {
    return `matched to ${act.name}'s audience in ${cityName}`;
  }
  return parts.join(" · ");
}

function holdVenue(cityName: string, why: string): VenuePick {
  return {
    entityId: "thin",
    name: "Hold",
    city: cityName,
    affinity: 0,
    popularity: 0,
    estimatedRoom: "Size unknown.",
    why,
    tags: [],
  };
}

async function pickVenue(client: Client, act: ResolvedAct, cityName: string, request: PlanRequest): Promise<VenuePick> {
  const tagId = act.kind === "person" ? PLACE_TAGS.comedyClub : PLACE_TAGS.musicVenue;
  const raw = await client.insights({
    "filter.type": "urn:entity:place",
    "filter.tags": tagId,
    "filter.location.query": cityName,
    "signal.interests.entities": act.entityId,
    "feature.explainability": true,
    take: 8,
  });
  const entities = isHeatmapResponse(raw) ? [] : raw.results.entities;
  const entity = pickByTier(entities, request.budgetTier);
  if (!entity) {
    return holdVenue(cityName, "Qloo returned no venue-tagged places for this city.");
  }
  return {
    entityId: entity.entity_id,
    name: entity.name,
    city: cityName,
    affinity: asNumber(entity.query?.affinity, 0),
    popularity: entityPopularity(entity, 0),
    estimatedRoom: roomSize(entity).label,
    why: explain(entity, act, cityName),
    tags: entityTags(entity).map((tag) => tag.name),
  };
}

async function pickOpeners(
  client: Client,
  act: ResolvedAct,
  cityName: string,
  used: Set<string>,
): Promise<OpenerPick[]> {
  const type = act.kind === "person" ? "urn:entity:person" : "urn:entity:artist";
  // Openers should draw less than the headliner. Cap at the act's own
  // popularity percentile instead of a fixed 0.45, which returned obscure
  // picks for every act probed.
  const cap = Math.max(0.3, Math.min(0.99, act.popularity));
  const raw = await client.insights({
    "filter.type": type,
    "signal.interests.entities": act.entityId,
    "signal.location.query": cityName,
    "filter.exclude.entities": act.entityId,
    "filter.popularity.max": Number(cap.toFixed(3)),
    take: 8,
  });
  if (isHeatmapResponse(raw)) {
    return [];
  }
  const fresh = raw.results.entities.filter((entity) => entity.entity_id !== act.entityId && !used.has(entity.entity_id));
  const entities = (fresh.length >= 2 ? fresh : raw.results.entities.filter((e) => e.entity_id !== act.entityId)).slice(0, 2);
  const compared = await Promise.all(
    entities.map((entity) => client.compare([act.entityId], [entity.entity_id])),
  );
  return entities.map((entity, index) => {
    used.add(entity.entity_id);
    const result = compared[index]?.results;
    const overlap = result?.overlap ?? 0;
    const affinity = asNumber(entity.query?.affinity, 0);
    const shared = result?.shared_tags?.slice(0, 2).join(", ");
    const note = shared ? `shares ${shared}` : entityDescription(entity) || "audience pick";
    return {
      entityId: entity.entity_id,
      name: entity.name,
      kind: entityKind(entity, act.kind),
      affinity,
      popularity: entityPopularity(entity, 0),
      overlap,
      why: `${entity.name} for ${cityName}: overlap ${overlap.toFixed(2)} · affinity ${affinity.toFixed(2)} · ${note}`,
    };
  });
}

async function promoFacts(
  client: Client,
  act: ResolvedAct,
  cityName: string,
  sharedTags: string[],
): Promise<{ podcasts: string[]; bars: string[]; brands: string[]; tags: string[] }> {
  const names = (raw: Awaited<ReturnType<Client["insights"]>>) =>
    isHeatmapResponse(raw) ? [] : raw.results.entities.map((entity) => entity.name);
  const empty: QlooEntitiesResponse = { success: true, results: { entities: [] } };
  const soft = (promise: ReturnType<Client["insights"]>) =>
    promise.catch((error: unknown) => {
      if (isAuthOrTypeError(error)) {
        throw error;
      }
      return empty;
    });
  const [podcastsRaw, barsRaw, brandsRaw] = await Promise.all([
    soft(
      client.insights({
        "filter.type": "urn:entity:podcast",
        "signal.interests.entities": act.entityId,
        "signal.location.query": cityName,
        take: 4,
      }),
    ),
    soft(
      client.insights({
        "filter.type": "urn:entity:place",
        "filter.tags": PLACE_TAGS.bar,
        "filter.location.query": cityName,
        "signal.interests.entities": act.entityId,
        take: 4,
      }),
    ),
    soft(
      client.insights({
        "filter.type": "urn:entity:brand",
        "signal.interests.entities": act.entityId,
        "signal.location.query": cityName,
        take: 4,
      }),
    ),
  ]);
  return {
    podcasts: names(podcastsRaw),
    bars: names(barsRaw),
    brands: names(brandsRaw),
    tags: sharedTags,
  };
}

/** Run a Qloo step; 401/403 still fail the plan, anything else degrades. */
async function softly<T>(emit: Emit, label: string, fallback: T, run: () => Promise<T>): Promise<{ value: T; failed: boolean }> {
  try {
    return { value: await run(), failed: false };
  } catch (error) {
    if (isAuthOrTypeError(error)) {
      throw error;
    }
    const message = error instanceof Error ? error.message : "unknown error";
    await emit(step(`${label} came back thin`, message.slice(0, 200), undefined, "warn"));
    return { value: fallback, failed: true };
  }
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
  const match = matchSearchHit(request.actName, found.results.entities);
  if (!match.ok) {
    const suggestion = match.suggestions.length
      ? `No exact Qloo match for “${request.actName}”. Did you mean ${match.suggestions.join(", ")}?`
      : `No Qloo entity for “${request.actName}”. Try a clearer name.`;
    await emit(
      step(
        match.suggestions.length ? "Did you mean" : "Act not found",
        match.suggestions.length
          ? `Search came back with ${match.suggestions.join(", ")}, not “${request.actName}”. Not routing a different act.`
          : "Search returned no entities.",
        "GET /search",
        "error",
      ),
    );
    return {
      status: "error",
      request,
      act: null,
      steps,
      route: null,
      summary: "",
      error: suggestion,
      qlooMode: client.mode,
      writer,
      thinData: true,
    };
  }
  const hit = match.entity;

  await emit(step("Loading entity details", hit.name, `GET /entities · ${harnessLabel("describe")}`));
  const details = await softly(emit, "Entity details", null, () => client.entities([hit.entity_id]));
  const entity: QlooEntity = details.value?.results.entities[0] ?? hit;
  const trend = await client.trends(entity.entity_id);
  if (trend.results.available) {
    await emit(
      step(
        "Checking momentum",
        "Week-over-week via /trends/entity.",
        `GET /trends/entity · ${harnessLabel("trends")}`,
      ),
    );
  }
  const act: ResolvedAct = {
    entityId: entity.entity_id,
    name: entity.name,
    kind: entityKind(entity, entityKind(hit, request.kindHint ?? "artist")),
    description: entityDescription(entity),
    popularity: entityPopularity(entity, entityPopularity(hit, 0.5)),
    ...(trend.results.available
      ? {
          trend: {
            available: true,
            delta: trend.results.delta,
            note: trend.results.note,
          },
        }
      : {}),
  };

  await emit(
    step(
      `Finding where fans of ${act.name} cluster`,
      "One national heatmap over the lower 48, cells snapped to the nearest tour city. City score is affinity × cell popularity.",
      `GET /v2/insights?filter.type=urn:heatmap · ${harnessLabel("where_popular")}`,
    ),
  );
  const heat = await softly(emit, "Heatmap", null, () => client.insights(cityHeatmapParams({ entityId: act.entityId })));
  const candidates = heat.value && isHeatmapResponse(heat.value) ? cellsToCities(heat.value.results.heatmap) : [];
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
      "Taste analysis",
      "Shared audience tags already on the act record, reused on every stop.",
      `GET /entities · ${harnessLabel("entity_tags")}`,
    ),
  );
  const sharedTags = entityTags(entity)
    .filter((tag) => !tag.type?.includes("keyword"))
    .map((tag) => tag.name)
    .slice(0, 8);
  const usedOpeners = new Set<string>();

  const stops: RoutedStop[] = [];
  let thin = candidates.length < request.showCount;
  for (let i = 0; i < routed.cities.length; i += 1) {
    const city = routed.cities[i]!;
    await emit(
      step(
        `Scoring venues in ${city.name}`,
        `filter.tags=${act.kind === "person" ? PLACE_TAGS.comedyClub : PLACE_TAGS.musicVenue}`,
        `GET /v2/insights?filter.type=urn:entity:place · ${harnessLabel("recommend")}`,
      ),
    );
    const venue = (
      await softly(emit, `Venues in ${city.name}`, holdVenue(city.name, "Qloo venue call failed for this city."), () =>
        pickVenue(client, act, city.name, request),
      )
    ).value;
    if (venue.entityId === "thin") {
      thin = true;
    }
    await emit(
      step(
        `Local openers in ${city.name}`,
        `${act.kind === "person" ? "Comics" : "Artists"} below the headliner's popularity, weighted to ${city.name}, plus compare.`,
        `GET /v2/insights + /v2/insights/compare · ${harnessLabel("compare_audiences")}`,
      ),
    );
    const openersRun = await softly(emit, `Openers in ${city.name}`, [] as OpenerPick[], () =>
      pickOpeners(client, act, city.name, usedOpeners),
    );
    const openers = openersRun.value;
    if (openersRun.failed || openers.length === 0) {
      thin = true;
    }
    await emit(
      step(
        `Promo brief for ${city.name}`,
        "Podcasts, bars, brands, and taste tags.",
        `GET /v2/insights (podcast, place, brand) · ${harnessLabel("recommend")}`,
      ),
    );
    const promo = (
      await softly(
        emit,
        `Promo for ${city.name}`,
        { podcasts: [], bars: [], brands: [], tags: sharedTags },
        () => promoFacts(client, act, city.name, sharedTags),
      )
    ).value;
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
