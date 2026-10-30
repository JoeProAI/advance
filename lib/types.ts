export type ActKind = "artist" | "person";
export type BudgetTier = "rooms" | "theaters" | "either";
export type PlanStatus = "running" | "ready" | "error";
export type QlooMode = "mock" | "live";
export type WriterMode = "openrouter" | "fallback";

export type PlanRequest = {
  actName: string;
  kindHint?: ActKind;
  homeCity?: string;
  showCount: number;
  maxDriveHours: number;
  startDate?: string;
  budgetTier: BudgetTier;
};

export type GeoPoint = {
  lat: number;
  lon: number;
};

export type City = GeoPoint & {
  name: string;
  region: string;
  country: string;
};

export type ResolvedAct = {
  entityId: string;
  name: string;
  kind: ActKind;
  description: string;
  /** Qloo `properties.biography` on the act record, used for related-act checks. */
  bio?: string;
  popularity: number;
  trend?: {
    available: boolean;
    delta?: number;
    note: string;
  };
};

export type VenuePick = {
  entityId: string;
  name: string;
  city: string;
  affinity: number;
  popularity: number;
  estimatedRoom: string;
  why: string;
  tags: string[];
};

export type OpenerPick = {
  entityId: string;
  name: string;
  kind: ActKind;
  affinity: number;
  popularity: number;
  /** Compare overlap. Only the lead opener per stop is compared. */
  overlap?: number;
  /** Qloo bio or birthplace names the stop city. */
  local?: boolean;
  /** Compare: how many taste tags Qloo says the two audiences share. */
  sharedTagCount?: number;
  /** Compare: the top shared tags with Qloo's scores. */
  sharedTags?: Array<{ name: string; score: number }>;
  why: string;
};

export type PromoBrief = {
  audience: string;
  podcasts: Array<{ name: string; why: string }>;
  bars: Array<{ name: string; why: string }>;
  brands: Array<{ name: string; why: string }>;
  socialPost: string;
};

export type RoutedStop = {
  order: number;
  date: string;
  /** Set when the date slid off a holiday, e.g. "moved off Dec 25". */
  dateNote?: string;
  city: City;
  affinity: number;
  affinityRank: number;
  venue: VenuePick;
  openers: OpenerPick[];
  /** @deprecated kept for stored plans; compare overlap was fake precision. */
  overlap: number;
  brief: PromoBrief;
  driveHoursFromPrev: number;
  milesFromPrev: number;
  receipt?: StopReceipt;
};

export type StopReceipt = {
  heat: {
    geohash?: string;
    cellAffinity?: number;
    cellPopularity: number;
    affinityRank: number;
    cityScore: number;
    baseline?: number;
    lift?: number;
    routeScore?: number;
  };
  /** Receipt numbers (QlooCallReceipt.n) of the calls behind this stop. */
  callNs: number[];
  promoEntityIds: string[];
};

export type CityBoardRow = {
  name: string;
  region: string;
  affinity: number;
  baseline?: number;
  lift?: number;
  score: number;
  routed: boolean;
  note: string;
};

export type PlanReceipts = {
  calls: import("@/lib/qloo/trace").QlooCallReceipt[];
  totals: { calls: number; live: number; cache: number; shared: number; mock: number; errors: number; ms: number };
  /** Named entities on the sheet that no Qloo response returned. */
  invented: number;
  checkedEntities: number;
};

export type RoutedTour = {
  stops: RoutedStop[];
  totalMiles: number;
  totalDriveHours: number;
  nights: number;
};

export type AgentStep = {
  id: string;
  at: number;
  title: string;
  detail: string;
  endpoint?: string;
  status: "running" | "done" | "warn" | "error";
};

export type TourPlan = {
  id: string;
  status: PlanStatus;
  createdAt: number;
  updatedAt: number;
  request: PlanRequest;
  act: ResolvedAct | null;
  steps: AgentStep[];
  route: RoutedTour | null;
  summary: string;
  error?: string;
  qlooMode: QlooMode;
  writer: WriterMode;
  thinData: boolean;
  cityBoard?: CityBoardRow[];
  scoring?: { method: string; panel: string[]; liftWeight: number; baselineLoaded: boolean };
  withoutQloo?: import("@/lib/scoring/without-qloo").WithoutQlooRoute;
  swaps?: Array<{ city: string; reason: string }>;
  receipts?: PlanReceipts;
};

export type CandidateCity = City & {
  affinity: number;
  affinityRank: number;
  popularity: number;
  /** Mean reference-panel score for this city, when a baseline was loaded. */
  baseline?: number;
  /** Act affinity minus baseline. */
  lift?: number;
  /** Routing score, 0 to 1. Falls back to affinity when absent. */
  score?: number;
  /** Winning heatmap cell, kept for receipts. */
  geohash?: string;
  cellAffinity?: number;
};
