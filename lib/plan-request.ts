import {
  DEFAULT_MAX_DRIVE_HOURS,
  DEFAULT_SHOW_COUNT,
  EXAMPLE_ACTS,
} from "@/lib/config";
import { defaultTourStartDate } from "@/lib/routing/plan";
import { assertPublicCulturalQuery } from "@/lib/qloo/signals";
import type { ActKind, BudgetTier, PlanRequest } from "@/lib/types";

function asKind(value: unknown): ActKind | undefined {
  if (value === "artist" || value === "person") {
    return value;
  }
  return undefined;
}

function asTier(value: unknown): BudgetTier {
  if (value === "rooms" || value === "theaters" || value === "either") {
    return value;
  }
  return "either";
}

export function parsePlanRequest(input: Record<string, unknown>): PlanRequest {
  const example = EXAMPLE_ACTS.find((act) => act.slug === input.example);
  const actName =
    typeof input.actName === "string" && input.actName.trim()
      ? input.actName.trim()
      : example?.name;
  if (!actName) {
    throw new Error("Enter a musician or comedian.");
  }
  const publicActName = assertPublicCulturalQuery("Act", actName);
  const showCount = Number(input.showCount ?? DEFAULT_SHOW_COUNT);
  if (!Number.isFinite(showCount) || showCount < 3 || showCount > 12) {
    throw new Error("Number of shows must be between 3 and 12.");
  }
  const maxDriveHours = Number(input.maxDriveHours ?? DEFAULT_MAX_DRIVE_HOURS);
  if (!Number.isFinite(maxDriveHours) || maxDriveHours < 2 || maxDriveHours > 12) {
    throw new Error("Max drive hours must be between 2 and 12.");
  }
  const rawDate = typeof input.startDate === "string" ? input.startDate.trim() : "";
  if (rawDate && (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate) || Number.isNaN(Date.parse(`${rawDate}T00:00:00`)))) {
    throw new Error("First date must be a real calendar day, written YYYY-MM-DD.");
  }
  const startDate = rawDate || defaultTourStartDate();
  const homeCity =
    typeof input.homeCity === "string" && input.homeCity.trim()
      ? assertPublicCulturalQuery("Home city", input.homeCity)
      : undefined;
  return {
    actName: publicActName,
    kindHint: asKind(input.kindHint) ?? example?.kind,
    homeCity,
    showCount: Math.round(showCount),
    maxDriveHours,
    startDate,
    budgetTier: asTier(input.budgetTier),
  };
}

export function planToCsv(plan: {
  act: { name: string } | null;
  route: {
    stops: Array<{
      order: number;
      date: string;
      city: { name: string; region: string };
      venue: { name: string };
      openers: Array<{ name: string }>;
      affinity: number;
      milesFromPrev: number;
    }>;
  } | null;
}): string {
  const header = ["stop", "date", "city", "region", "venue", "openers", "affinity", "miles_from_prev"];
  const rows = (plan.route?.stops ?? []).map((stop) => [
    String(stop.order),
    stop.date,
    stop.city.name,
    stop.city.region,
    stop.venue.name,
    stop.openers.map((opener) => opener.name).join(" / "),
    stop.affinity.toFixed(3),
    String(Math.round(stop.milesFromPrev)),
  ]);
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  return [header, ...rows].map((line) => line.map(escape).join(",")).join("\n");
}
