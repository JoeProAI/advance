import { findCity } from "@/lib/geo/cities";
import { QLOO_401_MESSAGE, QLOO_403_MESSAGE, isAuthOrTypeError } from "@/lib/qloo/errors";
import type { AgentStep, RoutedStop, TourPlan } from "@/lib/types";

export const DESK_STATES = [
  "offline",
  "qloo",
  "qloo-timeout",
  "partial",
  "no-heatmap",
  "act-not-found",
  "invalid-date",
  "openrouter",
  "not-found",
  "loading",
] as const;

export type DeskState = (typeof DESK_STATES)[number];

export function isDeskState(value: string | null | undefined): value is DeskState {
  return Boolean(value && (DESK_STATES as readonly string[]).includes(value));
}

export function parseDeskState(input: string | null | undefined): DeskState | null {
  if (!input) {
    return null;
  }
  return isDeskState(input) ? input : null;
}

export type DeskFailureCopy = {
  state: DeskState;
  stamp: "VOID" | "HOLD" | "OPEN" | "ROUTING";
  title: string;
  body: string;
  recovery: { href: string; label: string };
};

export const DESK_FAILURES: Record<Exclude<DeskState, "loading" | "partial">, DeskFailureCopy> = {
  offline: {
    state: "offline",
    stamp: "HOLD",
    title: "The desk line is down.",
    body: "This machine is offline. The atlas and the Qloo radio both need a live line. Reconnect, then stamp the sheet again.",
    recovery: { href: "/", label: "Return to the desk" },
  },
  qloo: {
    state: "qloo",
    stamp: "VOID",
    title: "Qloo returned a dead line.",
    body: "The taste radio failed before cities landed. Wrong key (401) or an unsupported entity type (403) are the usual causes. Nothing on this sheet was invented to fill the gap. Try the run again, or stay in mock mode.",
    recovery: { href: "/run?example=lenderman", label: "Stamp MJ Lenderman again" },
  },
  "qloo-timeout": {
    state: "qloo-timeout",
    stamp: "HOLD",
    title: "Qloo timed out on the heatmap.",
    body: "The desk waited, then closed the window. Heatmaps never arrived. Wait a minute and send the same act through once more.",
    recovery: { href: "/run?example=morril", label: "Stamp Sam Morril again" },
  },
  "no-heatmap": {
    state: "no-heatmap",
    stamp: "VOID",
    title: "No cities lit up.",
    body: "The heatmap came back empty. There is no run to route until Qloo names a city. Pick another act, or widen the corridor later.",
    recovery: { href: "/", label: "Pick another ticket" },
  },
  "act-not-found": {
    state: "act-not-found",
    stamp: "VOID",
    title: "No act on that name.",
    body: "Search did not land an entity. Type the name as a booker would say it, or open one of the three tickets already on the counter.",
    recovery: { href: "/", label: "Back to the sheet" },
  },
  "invalid-date": {
    state: "invalid-date",
    stamp: "HOLD",
    title: "That first date is not a day.",
    body: "Use a real calendar day as YYYY-MM-DD. The desk defaults to a Friday about eight weeks out when you leave the field blank.",
    recovery: { href: "/?fail=invalid-date", label: "Fix the date on the sheet" },
  },
  openrouter: {
    state: "openrouter",
    stamp: "HOLD",
    title: "The writer went quiet.",
    body: "OpenRouter did not finish the briefs. The route and rooms still stand. Retry the writer, or read the desk-copy briefs already filed.",
    recovery: { href: "/run?example=wednesday", label: "File the run on desk copy" },
  },
  "not-found": {
    state: "not-found",
    stamp: "VOID",
    title: "This share stub is empty.",
    body: "The desk never filed that plan id. Copy a link from a finished run, or stamp a new sheet from the counter.",
    recovery: { href: "/", label: "Open a new sheet" },
  },
};

export function deskCopyForPlanError(error: unknown): DeskFailureCopy | null {
  if (isAuthOrTypeError(error)) {
    return { ...DESK_FAILURES.qloo, body: error.message };
  }
  const message = typeof error === "string" ? error : error instanceof Error ? error.message : "";
  if (!message) {
    return null;
  }
  if (message === QLOO_401_MESSAGE || message === QLOO_403_MESSAGE) {
    return { ...DESK_FAILURES.qloo, body: message };
  }
  if (message.includes("heatmap came back empty") || message.includes("No city-level cells")) {
    return DESK_FAILURES["no-heatmap"];
  }
  if (message.includes("Did you mean") || message.startsWith("No Qloo entity")) {
    return { ...DESK_FAILURES["act-not-found"], body: message };
  }
  return null;
}

function cityOrThrow(name: string) {
  const city = findCity(name);
  if (!city) {
    throw new Error(`Missing city ${name}`);
  }
  return city;
}

function demoStop(input: {
  order: number;
  name: string;
  date: string;
  venue: string;
  why: string;
  affinity: number;
  room?: string;
  opener?: { name: string; why: string; overlap: number };
  driveHours: number;
  miles: number;
}): RoutedStop {
  const city = cityOrThrow(input.name);
  return {
    order: input.order,
    date: input.date,
    city,
    affinity: input.affinity,
    affinityRank: input.affinity,
    venue: {
      entityId: `demo-venue-${input.order}`,
      name: input.venue,
      city: input.name,
      affinity: input.affinity,
      popularity: input.affinity - 0.12,
      estimatedRoom: input.room ?? "Hold",
      why: input.why,
      tags: input.venue === "Hold" ? [] : ["Music Venue", "late-night radio"],
    },
    openers: input.opener
      ? [
          {
            entityId: `demo-opener-${input.order}`,
            name: input.opener.name,
            kind: "artist",
            affinity: input.affinity - 0.08,
            popularity: 0.18,
            overlap: input.opener.overlap,
            why: input.opener.why,
          },
        ]
      : [],
    overlap: input.opener?.overlap ?? 0,
    brief: {
      audience: `Taste that already gathers in ${input.name}.`,
      podcasts: [],
      bars: [],
      brands: [],
      socialPost: `${input.name}. ${input.venue}.`,
    },
    driveHoursFromPrev: input.driveHours,
    milesFromPrev: input.miles,
  };
}

/*
 * Desk previews use MJ Lenderman, one of the three demo acts. Cities, rooms,
 * openers, and scores are copied by name from the live run of Oct 20, 2026
 * (Chicago, Milwaukee, and Minneapolis stops). No raw Qloo payloads are stored here.
 */
const PREVIEW_ACT = {
  entityId: "demo-act",
  name: "MJ Lenderman",
  kind: "artist" as const,
  description: "Desk preview built from a live Settlement run.",
  popularity: 0.965,
};

export function demoPartialPlan(): TourPlan {
  const stops = [
    demoStop({
      order: 1,
      name: "Chicago",
      date: "2026-12-18",
      venue: "Schubas Tavern",
      why: "Chicago · Lake View · live music venue · aff 0.95 · Classic",
      affinity: 0.984,
      room: "Small room (Qloo tag: Intimate). No capacity on file. Price level 1 of 4.",
      opener: { name: "Ratboys", why: "Qloo bio names Chicago", overlap: 0.73 },
      driveHours: 0,
      miles: 0,
    }),
    demoStop({
      order: 2,
      name: "Milwaukee",
      date: "2026-12-19",
      venue: "Hold",
      why: "Milwaukee returned no venue-tagged room. Hold until a place comes back.",
      affinity: 0.888,
      driveHours: 1.6,
      miles: 92,
    }),
    demoStop({
      order: 3,
      name: "Minneapolis",
      date: "2026-12-21",
      venue: "The Hook and Ladder Theater & Lounge",
      why: "Minneapolis · Longfellow · live music venue · aff 0.88 · Artistic",
      affinity: 0.912,
      room: "Theater or hall (Qloo tag: Performing arts theater). No capacity on file.",
      opener: { name: "Cassandra Jenkins", why: "compare overlap from the live run", overlap: 0.85 },
      driveHours: 5.3,
      miles: 337,
    }),
  ];
  return {
    id: "adv_preview_partial",
    status: "ready",
    createdAt: 0,
    updatedAt: 0,
    request: {
      actName: PREVIEW_ACT.name,
      showCount: 8,
      maxDriveHours: 6,
      startDate: "2026-12-18",
      budgetTier: "either",
    },
    act: { ...PREVIEW_ACT },
    steps: demoLoadingSteps().map((step) => ({ ...step, status: "done" })),
    route: {
      stops,
      totalMiles: 429,
      totalDriveHours: 6.9,
      nights: 3,
    },
    summary:
      "MJ Lenderman plays three cities the heatmap already lights: Chicago to Milwaukee to Minneapolis. Milwaukee is on hold until a room returns.",
    qlooMode: "mock",
    writer: "fallback",
    thinData: true,
  };
}

export function demoReadyPlan(): TourPlan {
  const base = demoPartialPlan();
  const filled = base.route!.stops.map((stop) =>
    stop.venue.name === "Hold"
      ? demoStop({
          order: stop.order,
          name: stop.city.name,
          date: stop.date,
          venue: "Bremen Cafe",
          why: "Milwaukee · Riverwest · live music venue · aff 0.93 · Unique",
          affinity: 0.888,
          room: "Size unknown. No capacity on file. Price level 1 of 4.",
          opener: { name: "Dehd", why: "compare overlap from the live run", overlap: 0.84 },
          driveHours: stop.driveHoursFromPrev,
          miles: stop.milesFromPrev,
        })
      : stop,
  );
  return {
    ...base,
    id: "adv_preview_ready",
    thinData: false,
    route: { ...base.route!, stops: filled },
    summary: "MJ Lenderman plays three rooms the heatmap already lights: Chicago to Milwaukee to Minneapolis.",
  };
}

export function demoLoadingSteps(): AgentStep[] {
  return [
    {
      id: "step_preview_1",
      at: 1,
      title: "Resolving the act",
      detail: "Searching Qloo for the name on the sheet.",
      endpoint: "GET /search",
      status: "done",
    },
    {
      id: "step_preview_2",
      at: 2,
      title: "Finding where fans cluster",
      detail: "One national heatmap over the lower 48, cells snapped to tour cities.",
      endpoint: "GET /v2/insights?filter.type=urn:heatmap",
      status: "running",
    },
  ];
}

export function demoLoadingPlan(): TourPlan {
  return {
    ...demoReadyPlan(),
    id: "adv_preview_loading",
    status: "running",
    route: null,
    summary: "",
    steps: demoLoadingSteps(),
    act: { ...PREVIEW_ACT },
  };
}
