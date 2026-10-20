/**
 * Product name lives in one place so a rename is a one-line change.
 * NEXT_PUBLIC_APP_NAME can override it at build time.
 */
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "Advance";

export const APP_TAGLINE = "Plan a tour where your audience already is.";

export const QLOO_HACKATHON_HOST = "https://hackathon.api.qloo.com";
export const QLOO_TAKE_CAP = 50;
export const QLOO_CALL_BUDGET = 100;

export const DEFAULT_SHOW_COUNT = 8;
export const DEFAULT_MAX_DRIVE_HOURS = 5;
export const DEFAULT_CRUISE_MPH = 50;

export const PLAN_RATE_LIMIT_PER_HOUR = 5;

/**
 * Demo tickets: real public acts, resolved live through Qloo search.
 * Mock mode pairs these names with invented ids, rooms, and openers.
 */
export const EXAMPLE_ACTS = [
  {
    slug: "lenderman",
    name: "MJ Lenderman",
    kind: "artist" as const,
    role: "Indie rock songwriter",
    blurb: "Asheville songwriter. Small rooms where the crowd already knows the words.",
    stamp: "SOLO",
  },
  {
    slug: "morril",
    name: "Sam Morril",
    kind: "person" as const,
    role: "Touring comedian",
    blurb: "Club weekends and theater one-nighters. Cities that stay out after.",
    stamp: "COMIC",
  },
  {
    slug: "wednesday",
    name: "Wednesday",
    kind: "artist" as const,
    role: "Indie rock band",
    blurb: "Asheville band. Loud rooms and long drives through the South.",
    stamp: "BAND",
  },
] as const;

export type ExampleActSlug = (typeof EXAMPLE_ACTS)[number]["slug"];
