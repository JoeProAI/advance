import { cityKey, findCity } from "@/lib/geo/cities";
import { pickByTier, roomSize, wrongRoom } from "@/lib/agent/rooms";
import { createQlooClient, isHeatmapResponse } from "@/lib/qloo/client";
import { isAuthOrTypeError } from "@/lib/qloo/errors";
import {
  cellsToCities,
  dedupeMarkets,
  entityDescription,
  entityKind,
  entityPopularity,
  entityTags,
  explainScore,
  matchSearchHit,
  withinMiles,
} from "@/lib/qloo/parse";
import { PLACE_TAGS, cityHeatmapParams } from "@/lib/qloo/request";
import { withDeadline } from "@/lib/qloo/deadline";
import { assignOpeners, openerPopularityCap, rejectOpener, type AssignedOpener } from "@/lib/agent/openers";
import { harnessLabel } from "@/lib/qloo/workflows";
import type { QlooEntitiesResponse, QlooEntity } from "@/lib/qloo/types";
import { assignDatesDetailed, nightsOnRoad, selectAndRoute } from "@/lib/routing/plan";
import { createId } from "@/lib/utils";
import { resolveWriter, writeBrief, writeSummary } from "@/lib/agent/write";
import type {
  AgentStep,
  City,
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

const VENUE_RADIUS_MILES = 30;
const OPENER_POOL_TAKE = 50;
/** Agent budget inside the 60 s route: leaves room for the store writes. */
export const AGENT_BUDGET_MS = 50_000;
type Emit = (next: AgentStep) => Promise<void>;

const GENERIC_AMBIENCE = new Set(["Casual", "Social", "Lively", "Place", "Tourist attraction"]);
const MUSIC_CATEGORIES = [
  "Live music venue",
  "Live music bar",
  "Concert hall",
  "Performing arts theater",
  "Night club",
  "Event venue",
  "Comedy club",
];
const COMEDY_CATEGORIES = ["Comedy club", "Performing arts theater", "Concert hall", "Event venue", "Live music venue"];

function explain(entity: QlooEntity, act: ResolvedAct, cityName: string): string {
  const parts: string[] = [cityName];
  const neighborhood = entity.properties?.geocode?.name;
  if (neighborhood && neighborhood !== cityName) {
    parts.push(neighborhood);
  }
  const tags = entityTags(entity);
  const names = new Set(tags.map((tag) => tag.name));
  const category = (act.kind === "person" ? COMEDY_CATEGORIES : MUSIC_CATEGORIES).find((name) => names.has(name));
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
  // With one signal Qloo explains every pick at 1.00, which says nothing.
  // Only print the score when it actually discriminates.
  const score = explainScore(entity, act.entityId);
  if (typeof score === "number" && score < 0.999) {
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

export type VenueCheck = {
  venue: VenuePick;
  /** False when the call worked but no bookable room exists in the market. */
  usable: boolean;
  /** Why the city cannot be booked (drives the swap loop and the board note). */
  reason?: string;
};

function emptyVenueCheck(cityName: string, reason: string): VenueCheck {
  return { venue: holdVenue(cityName, reason), usable: false, reason };
}

async function pickVenue(client: Client, act: ResolvedAct, city: City, request: PlanRequest): Promise<VenueCheck> {
  const cityName = city.name;
  const tagId = act.kind === "person" ? PLACE_TAGS.comedyClub : PLACE_TAGS.musicVenue;
  const raw = await client.insights({
    "filter.type": "urn:entity:place",
    "filter.tags": tagId,
    "filter.location.query": cityKey(city),
    "signal.interests.entities": act.entityId,
    "feature.explainability": true,
    take: 8,
  });
  // Location queries are fuzzy; drop rooms that sit outside the market, and
  // drop rooms that are not bookable rooms at all (stadiums, orchestras,
  // record stores, museums all surfaced live in the Oct 29 audit).
  const dropped: string[] = [];
  const entities = (isHeatmapResponse(raw) ? [] : raw.results.entities).filter((entity) => {
    if (!withinMiles(entity, city, VENUE_RADIUS_MILES)) {
      return false;
    }
    const why = wrongRoom(entity);
    if (why) {
      dropped.push(`${entity.name} (${why})`);
      return false;
    }
    return true;
  });
  const entity = pickByTier(entities, request.budgetTier);
  if (!entity) {
    const reason =
      dropped.length > 0
        ? `only unusable rooms came back: ${dropped.slice(0, 3).join(", ")}`
        : "Qloo returned no venue-tagged places for this city";
    return emptyVenueCheck(cityName, `${reason}.`);
  }
  return {
    usable: true,
    venue: {
      entityId: entity.entity_id,
      name: entity.name,
      city: cityName,
      affinity: asNumber(entity.query?.affinity, 0),
      popularity: entityPopularity(entity, 0),
      estimatedRoom: roomSize(entity).label,
      why: explain(entity, act, cityName),
      tags: entityTags(entity).map((tag) => tag.name),
    },
  };
}

/** Tour-wide opener pool: one call, then plausibility filtering. */
async function openerPool(client: Client, act: ResolvedAct): Promise<{ pool: QlooEntity[]; dropped: string[] }> {
  const type = act.kind === "person" ? "urn:entity:person" : "urn:entity:artist";
  // Openers need headroom below the headliner: twice the headliner's distance
  // from the top of Qloo's popularity percentile, or peers leak in as support.
  const cap = openerPopularityCap(act.popularity);
  const raw = await client.insights({
    "filter.type": type,
    "signal.interests.entities": act.entityId,
    "filter.exclude.entities": act.entityId,
    "filter.popularity.max": Number(cap.toFixed(3)),
    take: OPENER_POOL_TAKE,
  });
  if (isHeatmapResponse(raw)) {
    return { pool: [], dropped: [] };
  }
  const pool: QlooEntity[] = [];
  const dropped: string[] = [];
  for (const entity of raw.results.entities) {
    const reason = rejectOpener(entity, act);
    if (reason) {
      if (reason !== "self") dropped.push(`${entity.name} (${reason})`);
    } else {
      pool.push(entity);
    }
  }
  return { pool, dropped };
}

/** Compare only the lead opener; the second keeps its Qloo affinity. */
async function scoreOpeners(
  client: Client,
  act: ResolvedAct,
  cityName: string,
  assigned: AssignedOpener[],
): Promise<OpenerPick[]> {
  const lead = assigned[0];
  const compared = lead ? await client.compare([act.entityId], [lead.entity.entity_id]) : undefined;
  return assigned.map(({ entity, local, repeat }, index) => {
    const affinity = asNumber(entity.query?.affinity, 0);
    const result = index === 0 ? compared?.results : undefined;
    // Compare scores are quantized (0.7309 repeated at all 8 Morril stops in
    // the audit), so the mean reads as fake precision. The shared-tag count
    // and the top tags are the honest evidence.
    const sharedCount = index === 0 ? result?.shared_count : undefined;
    const scoredTags = index === 0 ? result?.scored_tags?.slice(0, 3) : undefined;
    const sharedLine =
      typeof sharedCount === "number"
        ? `${sharedCount} shared tags${scoredTags?.length ? `: ${scoredTags.map((tag) => tag.name).join(", ")}` : ""}`
        : undefined;
    const parts = [
      `affinity ${affinity.toFixed(2)}`,
      local ? `Qloo bio names ${cityName}` : undefined,
      repeat ? "also on an earlier date" : undefined,
      sharedLine ?? (entityDescription(entity) || undefined),
    ].filter(Boolean);
    return {
      entityId: entity.entity_id,
      name: entity.name,
      kind: entityKind(entity, act.kind),
      affinity,
      popularity: entityPopularity(entity, 0),
      ...(typeof sharedCount === "number" ? { sharedTagCount: sharedCount } : {}),
      ...(scoredTags?.length ? { sharedTags: scoredTags } : {}),
      local,
      why: `${entity.name} for ${cityName}: ${parts.join(" · ")}`,
    };
  });
}

async function promoFacts(
  client: Client,
  act: ResolvedAct,
  locationQuery: string,
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
        "signal.location.query": locationQuery,
        take: 4,
      }),
    ),
    soft(
      client.insights({
        "filter.type": "urn:entity:place",
        "filter.tags": PLACE_TAGS.bar,
        "filter.location.query": locationQuery,
        "signal.interests.entities": act.entityId,
        take: 4,
      }),
    ),
    soft(
      client.insights({
        "filter.type": "urn:entity:brand",
        "signal.interests.entities": act.entityId,
        "signal.location.query": locationQuery,
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

export function runTourAgent(
  request: PlanRequest,
  hooks: RunHooks = {},
  budgetMs = AGENT_BUDGET_MS,
): Promise<Omit<TourPlan, "id" | "createdAt" | "updatedAt">> {
  return withDeadline(budgetMs, () => runWithinDeadline(request, hooks));
}

async function runWithinDeadline(
  request: PlanRequest,
  hooks: RunHooks,
): Promise<Omit<TourPlan, "id" | "createdAt" | "updatedAt">> {
  const client = createQlooClient();
  const writer = resolveWriter();
  const steps: AgentStep[] = [];
  // Stops run in parallel; chain step writes so the store sees them in order.
  let chain: Promise<void> = Promise.resolve();
  const emit = (next: AgentStep): Promise<void> => {
    steps.push(next);
    chain = chain.then(() => hooks.onStep?.(next)).catch(() => undefined);
    return chain;
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
  const actBio =
    typeof (entity.properties as { biography?: unknown } | undefined)?.biography === "string"
      ? (entity.properties as { biography: string }).biography
      : undefined;
  const act: ResolvedAct = {
    entityId: entity.entity_id,
    name: entity.name,
    kind: entityKind(entity, entityKind(hit, request.kindHint ?? "artist")),
    description: entityDescription(entity),
    ...(actBio ? { bio: actBio } : {}),
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
  const candidates =
    heat.value && isHeatmapResponse(heat.value) ? dedupeMarkets(cellsToCities(heat.value.results.heatmap)) : [];
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

  // Venue calls are cached per city so the swap loop never re-asks Qloo for
  // a market it already checked.
  const venueChecks = new Map<string, Promise<VenueCheck>>();
  const venueFor = (city: City): Promise<VenueCheck> => {
    const key = cityKey(city);
    let pending = venueChecks.get(key);
    if (!pending) {
      pending = pickVenue(client, act, city, request);
      venueChecks.set(key, pending);
    }
    return pending;
  };

  // Route, check rooms, swap cities with no bookable room for the next best
  // candidate, up to three rounds. Dates come after the final route.
  const droppedCities = new Set<string>();
  const swaps: Array<{ city: string; reason: string }> = [];
  const venueResults = new Map<string, VenueCheck>();
  let routed = selectAndRoute({
    candidates: candidates.filter((city) => !droppedCities.has(cityKey(city))),
    showCount: request.showCount,
    maxDriveHours: request.maxDriveHours,
    homeCity: home,
  });
  for (let round = 0; round < 3; round += 1) {
    const failedCheck = (city: City): VenueCheck => ({
      // A failed call is not proof of no room, so it holds instead of swapping.
      venue: holdVenue(city.name, "Qloo venue call failed for this city."),
      usable: true,
    });
    const checks = await Promise.all(
      routed.cities.map((city) =>
        softly(emit, `Venues in ${city.name}`, failedCheck(city), () => venueFor(city)),
      ),
    );
    checks.forEach((check, index) => {
      venueResults.set(cityKey(routed.cities[index]!), check.value);
    });
    const unusable = routed.cities.filter((city) => {
      const check = venueResults.get(cityKey(city));
      return check && !check.usable;
    });
    if (unusable.length === 0) {
      break;
    }
    // Never swap a city when losing it would leave the run short.
    const remaining = candidates.filter((city) => !droppedCities.has(cityKey(city)));
    if (remaining.length - unusable.length < request.showCount) {
      break;
    }
    const before = new Set(routed.cities.map(cityKey));
    for (const city of unusable) {
      droppedCities.add(cityKey(city));
      const reason = venueResults.get(cityKey(city))?.reason ?? "no usable room";
      swaps.push({ city: cityKey(city), reason });
    }
    routed = selectAndRoute({
      candidates: candidates.filter((city) => !droppedCities.has(cityKey(city))),
      showCount: request.showCount,
      maxDriveHours: request.maxDriveHours,
      homeCity: home,
    });
    const replacements = routed.cities.filter((city) => !before.has(cityKey(city)));
    for (const swap of swaps.slice(-unusable.length)) {
      const into = replacements.map((city) => cityKey(city)).join(" and ");
      await emit(
        step("Swapped a city", `Swapped ${swap.city}${into ? ` for ${into}` : " out"}: ${swap.reason}`),
      );
    }
  }
  const datePlan = assignDatesDetailed(routed.cities.length, request.startDate);
  const dates = datePlan.dates;

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

  await emit(
    step(
      "Pulling the opener pool",
      `${act.kind === "person" ? "Comics" : "Artists"} below the headliner's popularity, one call for the whole run. Qloo's location signal does not localize these types, so the desk boosts acts whose Qloo bio names the stop city and books no one twice.`,
      `GET /v2/insights?filter.type=${act.kind === "person" ? "urn:entity:person" : "urn:entity:artist"} · ${harnessLabel("compare_audiences")}`,
    ),
  );
  const poolRun = await softly(emit, "Opener pool", { pool: [] as QlooEntity[], dropped: [] as string[] }, () =>
    openerPool(client, act),
  );
  if (poolRun.value.dropped.length > 0) {
    await emit(
      step(
        "Dropped implausible openers",
        poolRun.value.dropped.slice(0, 8).join(", "),
      ),
    );
  }
  const assignments = assignOpeners(poolRun.value.pool, routed.cities);

  let thin = candidates.length < request.showCount;
  const stops: RoutedStop[] = await Promise.all(
    routed.cities.map(async (city, i): Promise<RoutedStop> => {
      // "Washington" alone resolved outside DC and "Richmond" can land in
      // California, so every location query carries the state.
      const where = cityKey(city);
      await emit(
        step(
          `Booking ${city.name}`,
          `Venue (filter.tags=${act.kind === "person" ? PLACE_TAGS.comedyClub : PLACE_TAGS.musicVenue}), opener compare, podcasts, bars, brands.`,
          `GET /v2/insights + /v2/insights/compare · ${harnessLabel("recommend")}`,
        ),
      );
      // The venue check already ran inside the swap loop; reuse it.
      const [venue, openersRun, promoRun] = await Promise.all([
        venueResults.get(cityKey(city))?.venue ??
          softly(emit, `Venues in ${city.name}`, emptyVenueCheck(city.name, "Qloo venue call failed for this city."), () =>
            venueFor(city),
          ).then((check) => check.value.venue),
        softly(emit, `Openers in ${city.name}`, [] as OpenerPick[], () =>
          scoreOpeners(client, act, city.name, assignments[i] ?? []),
        ),
        softly(emit, `Promo for ${city.name}`, { podcasts: [], bars: [], brands: [], tags: sharedTags }, () =>
          promoFacts(client, act, where, sharedTags),
        ),
      ]);
      const openers = openersRun.value;
      if (venue.entityId === "thin" || openersRun.failed || openers.length === 0) {
        thin = true;
      }
      const promo = promoRun.value;
      const brief: PromoBrief = await writeBrief({
        act,
        city: city.name,
        venue: venue.name,
        venueWhy: venue.why,
        openers: openers.map((opener) => ({
          name: opener.name,
          sharedTagCount: opener.sharedTagCount,
          sharedTags: opener.sharedTags,
          why: opener.why,
        })),
        podcasts: promo.podcasts,
        bars: promo.bars,
        brands: promo.brands,
        tags: promo.tags,
        affinity: city.affinity,
      });
      return {
        order: i + 1,
        date: dates[i]!,
        ...(datePlan.notes[i] ? { dateNote: datePlan.notes[i]! } : {}),
        city,
        affinity: city.affinity,
        affinityRank: city.affinityRank,
        venue,
        openers,
        overlap: 0,
        brief,
        driveHoursFromPrev: city.driveHoursFromPrev,
        milesFromPrev: city.milesFromPrev,
      };
    }),
  );

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
  await chain;

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
    ...(swaps.length ? { swaps } : {}),
  };
}
