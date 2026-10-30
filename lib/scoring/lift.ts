import type { CandidateCity } from "@/lib/types";

/**
 * City scoring by lift. A raw heatmap says "fans are in New York", which is
 * true for almost every act. Lift asks where THIS act over-indexes compared
 * with a reference panel of big touring acts across genres and comedy. The
 * route uses a blend so a city needs both real fans and an edge.
 */
export const REFERENCE_PANEL = [
  { name: "Taylor Swift", entityId: "3C9EEC3A-F4FE-48A4-B89F-97375F292448" },
  { name: "Morgan Wallen", entityId: "51EFD025-B1A0-49C6-B628-4A49CF12E915" },
  { name: "Drake", entityId: "088C8322-5E1F-4D2E-99D3-5133AD16BABE" },
  { name: "Bad Bunny", entityId: "7890B792-2CFD-4840-AC2D-8F1D2405B183" },
  { name: "Kendrick Lamar", entityId: "C915A918-39C5-47A3-A101-D9FA1DECBD9C" },
  { name: "Phoebe Bridgers", entityId: "AFBC71A7-9439-4AB0-AB68-D14B11AAF836" },
  { name: "Khruangbin", entityId: "BAF6317A-DF94-4C90-92AE-63F86560C21B" },
  { name: "Tyler Childers", entityId: "9B5028F6-5808-4BF4-A623-24C6C148D24B" },
  { name: "Hozier", entityId: "7D903E2F-70AB-44CB-AA88-82501E6D04DD" },
  { name: "Kevin Hart", entityId: "D3E9FC88-9837-46A5-8F0F-A69FD4D18082" },
  { name: "Nate Bargatze", entityId: "A8941EEB-BCD7-4D71-9DF6-28893DC1AF32" },
  { name: "John Mulaney", entityId: "BDA4DDC1-E7C1-410E-8001-C1E17E29465C" },
] as const;

export const LIFT_WEIGHT = 0.5;
/**
 * Backtest-only second method, added after the first lift-vs-metros result:
 * a fixed 50/50 blend of normalized metro population and the Qloo lift score.
 * The weight is declared a priori, not tuned on the backtest tours.
 */
export const COMBINED_WEIGHT = 0.5;
export const BASELINE_CACHE_KEY = "advance:baseline:v1";

export type Baseline = {
  panel: string[];
  /** City name + region -> mean panel score (affinity x popularity). */
  cities: Record<string, number>;
};

export type ScoredCity = CandidateCity & { baseline: number; lift: number; score: number };

export function cityId(city: { name: string; region: string }): string {
  return `${city.name}, ${city.region}`;
}

/** Mean panel score per city. A city missing from a panel heatmap counts 0. */
export function buildBaseline(panel: Array<{ name: string; cities: CandidateCity[] }>): Baseline {
  const sums = new Map<string, number>();
  for (const member of panel) {
    for (const city of member.cities) {
      sums.set(cityId(city), (sums.get(cityId(city)) ?? 0) + city.affinity);
    }
  }
  const cities: Record<string, number> = {};
  for (const [key, sum] of sums) cities[key] = sum / Math.max(1, panel.length);
  return { panel: panel.map((member) => member.name), cities };
}

function normalizer(values: number[]): (value: number) => number {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  return (value) => (span > 1e-9 ? (value - min) / span : 1);
}

/**
 * Blend: (1 - w) x normalized act affinity + w x normalized lift. With no
 * baseline the score is the normalized affinity alone and lift reads 0.
 */
export function scoreCities(candidates: CandidateCity[], baseline: Baseline | null, weight = LIFT_WEIGHT): ScoredCity[] {
  if (candidates.length === 0) return [];
  const withLift = candidates.map((city) => {
    const base = baseline ? (baseline.cities[cityId(city)] ?? 0) : 0;
    return { city, base, lift: baseline ? city.affinity - base : 0 };
  });
  const normAffinity = normalizer(withLift.map((row) => row.city.affinity));
  const normLift = normalizer(withLift.map((row) => row.lift));
  const w = baseline ? weight : 0;
  return withLift
    .map(({ city, base, lift }) => ({
      ...city,
      baseline: base,
      lift,
      score: (1 - w) * normAffinity(city.affinity) + w * normLift(lift),
    }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Combined ranking over every market: weight x normalized metro population +
 * (1 - weight) x the city lift score (0 for markets absent from the heatmap).
 */
export function combinedScores(
  scored: ScoredCity[],
  marketIds: string[],
  metroPop: Record<string, number>,
  weight = COMBINED_WEIGHT,
): Array<{ id: string; score: number }> {
  const liftById = new Map(scored.map((city) => [cityId(city), city.score]));
  const pops = marketIds.map((id) => metroPop[id] ?? 0);
  const normPop = normalizer(pops);
  return marketIds
    .map((id, i) => ({
      id,
      score: weight * normPop(pops[i]) + (1 - weight) * (liftById.get(id) ?? 0),
    }))
    .sort((a, b) => b.score - a.score);
}
