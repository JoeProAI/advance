import { DEFAULT_CRUISE_MPH, DEFAULT_MAX_DRIVE_HOURS } from "@/lib/config";
import type { CandidateCity, City } from "@/lib/types";

export type RouteInput = {
  candidates: CandidateCity[];
  showCount: number;
  maxDriveHours: number;
  homeCity?: City;
  cruiseMph?: number;
};

export type RoutedCity = CandidateCity & {
  milesFromPrev: number;
  driveHoursFromPrev: number;
};

export type RouteResult = {
  cities: RoutedCity[];
  totalMiles: number;
  totalDriveHours: number;
};

const EARTH_MILES = 3958.8;

export function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversineMiles(a: Pick<City, "lat" | "lon">, b: Pick<City, "lat" | "lon">): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLon = toRadians(b.lon - a.lon);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function driveHours(miles: number, mph = DEFAULT_CRUISE_MPH): number {
  if (mph <= 0) {
    throw new Error("cruise speed must be positive");
  }
  return miles / mph;
}

function pathDistance(order: number[], cities: CandidateCity[]): number {
  let total = 0;
  for (let i = 1; i < order.length; i += 1) {
    const prev = cities[order[i - 1]!];
    const next = cities[order[i]!];
    if (!prev || !next) {
      continue;
    }
    total += haversineMiles(prev, next);
  }
  return total;
}

export function nearestNeighborOrder(cities: CandidateCity[], startIndex = 0): number[] {
  if (cities.length === 0) {
    return [];
  }
  const remaining = new Set(cities.map((_, i) => i));
  const start = Math.min(Math.max(0, startIndex), cities.length - 1);
  const order = [start];
  remaining.delete(start);
  while (remaining.size > 0) {
    const current = cities[order[order.length - 1]!]!;
    let best = -1;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const index of remaining) {
      const dist = haversineMiles(current, cities[index]!);
      if (dist < bestDist) {
        bestDist = dist;
        best = index;
      }
    }
    remaining.delete(best);
    order.push(best);
  }
  return order;
}

export function twoOpt(order: number[], cities: CandidateCity[]): number[] {
  if (order.length < 4) {
    return [...order];
  }
  let best = [...order];
  let improved = true;
  let guard = 0;
  while (improved && guard < 80) {
    improved = false;
    guard += 1;
    const baseline = pathDistance(best, cities);
    for (let i = 1; i < best.length - 2; i += 1) {
      for (let k = i + 1; k < best.length - 1; k += 1) {
        const next = best.slice(0, i).concat(best.slice(i, k + 1).reverse(), best.slice(k + 1));
        if (pathDistance(next, cities) + 0.01 < baseline) {
          best = next;
          improved = true;
        }
      }
    }
  }
  return best;
}

function decorate(order: CandidateCity[], mph: number): RouteResult {
  const cities: RoutedCity[] = order.map((city, index) => {
    if (index === 0) {
      return { ...city, milesFromPrev: 0, driveHoursFromPrev: 0 };
    }
    const prev = order[index - 1]!;
    const miles = haversineMiles(prev, city);
    return {
      ...city,
      milesFromPrev: miles,
      driveHoursFromPrev: driveHours(miles, mph),
    };
  });
  const totalMiles = cities.reduce((sum, city) => sum + city.milesFromPrev, 0);
  return {
    cities,
    totalMiles,
    totalDriveHours: driveHours(totalMiles, mph),
  };
}

function respectsDrive(order: CandidateCity[], maxHours: number, mph: number): boolean {
  for (let i = 1; i < order.length; i += 1) {
    if (driveHours(haversineMiles(order[i - 1]!, order[i]!), mph) > maxHours + 0.05) {
      return false;
    }
  }
  return true;
}

function greedySelect(
  pool: CandidateCity[],
  showCount: number,
  maxHours: number,
  start: CandidateCity,
  mph: number,
): CandidateCity[] {
  const selected = [start];
  const remaining = pool.filter((city) => city.name !== start.name || city.region !== start.region);
  while (selected.length < showCount && remaining.length > 0) {
    const current = selected[selected.length - 1]!;
    let bestIndex = -1;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < remaining.length; i += 1) {
      const candidate = remaining[i]!;
      const hours = driveHours(haversineMiles(current, candidate), mph);
      if (hours > maxHours) {
        continue;
      }
      const score = candidate.affinity - hours / Math.max(maxHours, 0.1);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }
    if (bestIndex === -1) {
      break;
    }
    selected.push(remaining.splice(bestIndex, 1)[0]!);
  }
  return selected;
}

export function selectAndRoute(input: RouteInput): RouteResult {
  const mph = input.cruiseMph ?? DEFAULT_CRUISE_MPH;
  const maxHours = input.maxDriveHours || DEFAULT_MAX_DRIVE_HOURS;
  const showCount = Math.max(2, Math.min(input.showCount, input.candidates.length));
  if (input.candidates.length === 0) {
    return { cities: [], totalMiles: 0, totalDriveHours: 0 };
  }

  const ranked = [...input.candidates].sort((a, b) => b.affinity - a.affinity);
  const home = input.homeCity
    ? ranked.find(
        (city) =>
          city.name.toLowerCase() === input.homeCity!.name.toLowerCase() ||
          `${city.name}, ${city.region}`.toLowerCase() ===
            `${input.homeCity!.name}, ${input.homeCity!.region}`.toLowerCase(),
      )
    : undefined;
  const start =
    home ??
    ranked.reduce((best, city) => {
      const candidateLen = greedySelect(ranked, showCount, maxHours, city, mph).length;
      const bestLen = greedySelect(ranked, showCount, maxHours, best, mph).length;
      if (candidateLen !== bestLen) {
        return candidateLen > bestLen ? city : best;
      }
      return city.affinity > best.affinity ? city : best;
    }, ranked[0]!);
  const selected = greedySelect(ranked, showCount, maxHours, start, mph);
  const startIndex = 0;
  const orderIdx = twoOpt(nearestNeighborOrder(selected, startIndex), selected);
  let ordered = orderIdx.map((i) => selected[i]!);

  if (home && ordered[0] && ordered[0].name !== start.name) {
    const homeAt = ordered.findIndex((city) => city.name === start.name);
    if (homeAt > 0) {
      ordered = [start, ...ordered.filter((city) => city.name !== start.name)];
    }
  }

  if (!respectsDrive(ordered, maxHours, mph)) {
    ordered = greedySelect(ranked, showCount, maxHours, start, mph);
  }

  return decorate(ordered, mph);
}

export const BOOKING_WINDOW_DAYS = 56;

export function snapToFriday(from: Date): Date {
  const date = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), 12));
  const day = date.getUTCDay();
  const delta = (5 - day + 7) % 7;
  date.setUTCDate(date.getUTCDate() + delta);
  return date;
}

export function defaultTourStartDate(from: Date = new Date()): string {
  const target = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), 12));
  target.setUTCDate(target.getUTCDate() + BOOKING_WINDOW_DAYS);
  return snapToFriday(target).toISOString().slice(0, 10);
}

export function assignDates(stopCount: number, startDate?: string, restEvery = 3): string[] {
  const start = startDate
    ? new Date(`${startDate}T12:00:00Z`)
    : new Date(`${defaultTourStartDate()}T12:00:00Z`);
  if (Number.isNaN(start.getTime())) {
    throw new Error("startDate must be YYYY-MM-DD");
  }
  const dates: string[] = [];
  const cursor = new Date(start);
  for (let i = 0; i < stopCount; i += 1) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if ((i + 1) % restEvery === 0 && i < stopCount - 1) {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }
  return dates;
}

export function nextFriday(from: Date): Date {
  const date = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), 12));
  const day = date.getUTCDay();
  const delta = (5 - day + 7) % 7 || 7;
  date.setUTCDate(date.getUTCDate() + delta);
  return date;
}

export function nightsOnRoad(dates: string[]): number {
  if (dates.length === 0) {
    return 0;
  }
  const first = new Date(`${dates[0]}T12:00:00Z`).getTime();
  const last = new Date(`${dates[dates.length - 1]}T12:00:00Z`).getTime();
  return Math.max(0, Math.round((last - first) / 86_400_000));
}
