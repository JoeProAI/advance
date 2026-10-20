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

export const EXAMPLE_ACTS = [
  {
    slug: "marlow",
    name: "Marlow & the Night Shifts",
    kind: "artist" as const,
    role: "Indie band",
    blurb: "Midwest rooms, late drives, crowds that already know the choruses.",
    stamp: "BAND",
  },
  {
    slug: "rina",
    name: "Rina Voss",
    kind: "person" as const,
    role: "Touring comedian",
    blurb: "Clubs that book tight sets. Cities that stay out after.",
    stamp: "COMIC",
  },
  {
    slug: "kite",
    name: "KITE/440",
    kind: "artist" as const,
    role: "DJ",
    blurb: "Warehouse nights and industrial towns that still dance on a Tuesday.",
    stamp: "DJ",
  },
] as const;

export type ExampleActSlug = (typeof EXAMPLE_ACTS)[number]["slug"];
