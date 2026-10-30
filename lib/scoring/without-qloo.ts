import { US_CITIES } from "@/lib/geo/cities";
import { METRO_POP_MILLIONS } from "@/lib/geo/metro-pop";
import { dedupeMarkets } from "@/lib/qloo/parse";
import { selectAndRoute } from "@/lib/routing/plan";
import { cityId } from "@/lib/scoring/lift";
import type { CandidateCity, City } from "@/lib/types";

export type WithoutQlooRoute = {
  method: string;
  cities: Array<{ name: string; region: string; lat: number; lon: number; metroMillions: number }>;
  totalMiles: number;
  /** Stops that both routes share. */
  shared: string[];
};

/**
 * The same router, same drive cap, same home city, but cities ranked by
 * metro population instead of Qloo. Zero Qloo calls. This is the honest
 * "what would I book without taste data" answer.
 */
export function routeWithoutQloo(input: {
  showCount: number;
  maxDriveHours: number;
  homeCity?: City;
  qlooStops: Array<{ name: string; region: string }>;
}): WithoutQlooRoute {
  const max = Math.max(...Object.values(METRO_POP_MILLIONS));
  const candidates: CandidateCity[] = dedupeMarkets(
    US_CITIES.map((city) => {
      const pop = METRO_POP_MILLIONS[cityId(city)] ?? 0;
      return { ...city, affinity: pop / max, affinityRank: 0, popularity: 0, score: pop / max };
    }).sort((a, b) => b.affinity - a.affinity),
  );
  const routed = selectAndRoute({
    candidates,
    showCount: input.showCount,
    maxDriveHours: input.maxDriveHours,
    homeCity: input.homeCity,
  });
  const qloo = new Set(input.qlooStops.map(cityId));
  return {
    method: "Biggest metros first (2020 Census), same router, same drive cap. No Qloo calls.",
    cities: routed.cities.map((city) => ({
      name: city.name,
      region: city.region,
      lat: city.lat,
      lon: city.lon,
      metroMillions: METRO_POP_MILLIONS[cityId(city)] ?? 0,
    })),
    totalMiles: routed.totalMiles,
    shared: routed.cities.filter((city) => qloo.has(cityId(city))).map(cityId),
  };
}
