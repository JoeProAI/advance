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
    recovery: { href: "/run?example=marlow", label: "Stamp Marlow again" },
  },
  "qloo-timeout": {
    state: "qloo-timeout",
    stamp: "HOLD",
    title: "Qloo timed out on the heatmap.",
    body: "The desk waited, then closed the window. Heatmaps never arrived. Wait a minute and send the same act through once more.",
    recovery: { href: "/run?example=rina", label: "Stamp Rina again" },
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
    recovery: { href: "/", label: "Back to the advance sheet" },
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
    recovery: { href: "/run?example=kite", label: "File the run on desk copy" },
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

export function demoPartialPlan(): TourPlan {
  const stops = [
    demoStop({
      order: 1,
      name: "Pittsburgh",
      date: "2026-12-04",
      venue: "Lawrenceville Rail",
      why: "Pittsburgh · room · 280 cap · aff 0.91 · late-night radio",
      affinity: 0.91,
      room: "280-cap room",
      opener: { name: "Hollow Radio", why: "Lawrenceville support, story songs", overlap: 0.71 },
      driveHours: 0,
      miles: 0,
    }),
    demoStop({
      order: 2,
      name: "Columbus",
      date: "2026-12-05",
      venue: "Hold",
      why: "Columbus returned no venue-tagged room. Hold until a place comes back.",
      affinity: 0.74,
      driveHours: 2.6,
      miles: 185,
    }),
    demoStop({
      order: 3,
      name: "Chicago",
      date: "2026-12-06",
      venue: "Lincoln Annex",
      why: "Chicago · room · 340 cap · aff 0.88 · thrift denim",
      affinity: 0.88,
      room: "340-cap room",
      opener: { name: "June Ledger", why: "Pilsen support, night-drive duo", overlap: 0.64 },
      driveHours: 5.1,
      miles: 355,
    }),
  ];
  return {
    id: "adv_preview_partial",
    status: "ready",
    createdAt: 0,
    updatedAt: 0,
    request: {
      actName: "Marlow & the Night Shifts",
      showCount: 8,
      maxDriveHours: 5,
      startDate: "2026-12-04",
      budgetTier: "either",
    },
    act: {
      entityId: "demo-act",
      name: "Marlow & the Night Shifts",
      kind: "artist",
      description: "Synthetic desk preview.",
      popularity: 0.4,
    },
    steps: demoLoadingSteps().map((step) => ({ ...step, status: "done" })),
    route: {
      stops,
      totalMiles: 220,
      totalDriveHours: 4.2,
      nights: 3,
    },
    summary:
      "Marlow & the Night Shifts plays three cities the heatmap already lights: Pittsburgh to Columbus to Chicago. Columbus is on hold until a room returns.",
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
          venue: "Short North Civic",
          why: "Columbus · room · 260 cap · aff 0.79 · regional beer",
          affinity: 0.79,
          room: "260-cap room",
          opener: { name: "Wiregrass", why: "Short North support, story songs", overlap: 0.58 },
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
    summary:
      "Marlow & the Night Shifts plays three rooms the heatmap already lights: Pittsburgh to Columbus to Chicago.",
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
      detail: "City-level heatmaps over five regions.",
      endpoint: "GET /v2/insights?filter.type=urn:entity:destination&output.heatmap.boundary=city",
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
    act: {
      entityId: "demo-act",
      name: "Marlow & the Night Shifts",
      kind: "artist",
      description: "Synthetic desk preview.",
      popularity: 0.4,
    },
  };
}
