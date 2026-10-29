import { haversineMiles } from "@/lib/routing/plan";
import type { RoomSize } from "@/lib/agent/rooms";
import type { ResolvedAct, RoutedStop } from "@/lib/types";

/**
 * Settlement math. Qloo provides the taste inputs (room-size tag, price_level,
 * act popularity); everything else on this sheet is a labeled assumption the
 * booker edits. Nothing here pretends a guessed number came from Qloo.
 */

/** Editable capacity bands per Qloo room-size tag. Qloo has no capacity data. */
export const CAPACITY_BANDS: Record<Exclude<RoomSize, "unknown">, [number, number]> = {
  small: [150, 400],
  club: [400, 1200],
  theater: [1200, 3000],
};

export type DealAssumptions = {
  /** Ticketed capacity. Midpoint of the band by default; editable. */
  capacity: number;
  /** Expected paid attendance share. Default 70%; editable. */
  sellThrough: number;
  /** Estimated ticket price. Assumption; editable. */
  ticketPrice: number;
  /** Artist guarantee floor. Assumption; editable. */
  guarantee: number;
  /** Percentage of net the artist gets versus the guarantee. Default 85%. */
  versusPct: number;
};

export type DealEstimate = {
  assumptions: DealAssumptions;
  /** capacity x sellThrough x ticketPrice */
  projectedGross: number;
  /** versusPct x projectedGross */
  versusAmount: number;
  /** max(guarantee, versusAmount) */
  offer: number;
  warnings: string[];
};

/** Assumption: base ticket estimate from act popularity and venue price_level. */
export function estimateTicketPrice(actPopularity: number, priceLevel?: number): number {
  const base = 20 + 50 * Math.min(Math.max(actPopularity, 0), 1);
  const bump = typeof priceLevel === "number" ? priceLevel * 5 : 0;
  return Math.round((base + bump) / 5) * 5;
}

/** Default assumptions for a stop; every field is editable on the packet. */
export function defaultAssumptions(stop: RoutedStop, act: ResolvedAct): DealAssumptions {
  const size = stop.venue.size ?? "unknown";
  const band = size === "unknown" ? undefined : CAPACITY_BANDS[size];
  const capacity = band ? Math.round((band[0] + band[1]) / 2) : 0;
  const ticketPrice = estimateTicketPrice(act.popularity, stop.venue.priceLevel);
  const gross = capacity * 0.7 * ticketPrice;
  return {
    capacity,
    sellThrough: 0.7,
    ticketPrice,
    guarantee: Math.round((gross * 0.6) / 100) * 100,
    versusPct: 0.85,
  };
}

export function computeDeal(stop: RoutedStop, a: DealAssumptions): DealEstimate {
  const projectedGross = Math.round(a.capacity * a.sellThrough * a.ticketPrice);
  const versusAmount = Math.round(a.versusPct * projectedGross);
  return {
    assumptions: a,
    projectedGross,
    versusAmount,
    offer: Math.max(a.guarantee, versusAmount),
    warnings: dealWarnings(stop, a),
  };
}

/** Warnings that are rules, not guesses. */
export function dealWarnings(stop: RoutedStop, a?: DealAssumptions): string[] {
  const warnings: string[] = [];
  if (stop.venue.name === "Hold" || stop.venue.entityId === "thin") {
    warnings.push("no confirmed room: this stop is on hold");
  }
  if (stop.driveHoursFromPrev >= 8) {
    warnings.push(`tight drive leg: ${stop.driveHoursFromPrev.toFixed(1)}h from the last stop`);
  }
  if (a && a.capacity === 0) {
    warnings.push("capacity unknown: enter a number before quoting the room");
  }
  return warnings;
}

/**
 * Radius-clause warning: another stop on this run within `miles` of this one
 * and within `days` of its date (typical clauses run 60-100 mi, 30 days).
 */
export function radiusClauseWarnings(stops: RoutedStop[], miles = 100, days = 30): Map<number, string[]> {
  const out = new Map<number, string[]>();
  const dayMs = 24 * 3600 * 1000;
  for (const stop of stops) {
    const conflicts: string[] = [];
    for (const other of stops) {
      if (other.order === stop.order) {
        continue;
      }
      const apart = Math.abs(new Date(stop.date).getTime() - new Date(other.date).getTime());
      const dist = haversineMiles(stop.city, other.city);
      if (dist <= miles && apart <= days * dayMs) {
        conflicts.push(`${other.city.name}, ${other.city.region} (${Math.round(dist)} mi, ${other.date})`);
      }
    }
    if (conflicts.length) {
      out.set(stop.order, conflicts);
    }
  }
  return out;
}

/** Text-only hold-request draft per stop; nothing is ever sent. */
export function holdRequestEmail(stop: RoutedStop, act: ResolvedAct): string {
  return [
    `Subject: Hold request - ${act.name} - ${stop.date}`,
    ``,
    `Hi ${stop.venue.name} team,`,
    ``,
    `I'd like to place a hold for ${act.name} on ${stop.date} in ${stop.city.name}, ${stop.city.region}.`,
    `Could you confirm availability and your standard terms for a show of this size?`,
    ``,
    `Thanks,`,
    `${act.name} booking`,
  ].join("\n");
}
