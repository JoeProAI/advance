/**
 * Backtest: does Settlement's Qloo lift ranking hit real announced tour
 * routing better than a biggest-metros list?
 *
 * Method: for each tour in data/backtest/tours.json, take the real NA cities
 * (already mapped to our 36 markets by the data file). Set K to the number of
 * distinct real cities. Rank candidates two ways and take the top K:
 *   1. Qloo lift score: 0.5 x normalized affinity + 0.5 x normalized lift vs
 *      the REFERENCE_PANEL mean (the same score the live router uses).
 *   2. Biggest metros: 2020 Census metro population, descending.
 *   3. Combined (added after the first result): a fixed 50/50 blend of
 *      normalized metro population and the Qloo lift score. The weight was
 *      declared up front and was NOT tuned on these tours.
 * Hits = predicted cities that appear in the real routing. Report hits/K
 * per act and in aggregate. A paid LLM-only baseline is intentionally
 * omitted: no paid spend is allowed in this project.
 *
 * Usage: QLOO_MODE=live npx tsx scripts/backtest.ts
 * Writes data/backtest/results.json (derived hit counts only, never raw
 * Qloo payloads) and prints the same summary.
 */
import { readFile, writeFile } from "node:fs/promises";
import { US_CITIES } from "../lib/geo/cities";
import { METRO_POP_MILLIONS } from "../lib/geo/metro-pop";
import { createQlooClient, isHeatmapResponse } from "../lib/qloo/client";
import { cellsToCities, matchSearchHit } from "../lib/qloo/parse";
import { cityHeatmapParams } from "../lib/qloo/request";
import {
  BASELINE_CACHE_KEY,
  COMBINED_WEIGHT,
  REFERENCE_PANEL,
  buildBaseline,
  cityId,
  combinedScores,
  scoreCities,
  type Baseline,
} from "../lib/scoring/lift";
import { getPlanStore } from "../lib/storage";
import type { CandidateCity } from "../lib/types";

type TourEntry = {
  act: string;
  kind: "artist" | "person";
  tour: string;
  source: string;
  dates: Array<{ date: string; city: string }>;
};

type ActResult = {
  act: string;
  tour: string;
  source: string;
  realCities: number;
  k: number;
  liftHits: number;
  metroHits: number;
  combinedHits: number;
  liftRecall: number;
  metroRecall: number;
  combinedRecall: number;
};

const marketIds = new Set(US_CITIES.map(cityId));
const metroRank = [...US_CITIES]
  .map((city) => ({ id: cityId(city), pop: METRO_POP_MILLIONS[cityId(city)] ?? 0 }))
  .sort((a, b) => b.pop - a.pop)
  .map((row) => row.id);

async function loadBaseline(client: ReturnType<typeof createQlooClient>): Promise<Baseline | null> {
  const store = getPlanStore();
  const cached = await store.cacheGet(BASELINE_CACHE_KEY);
  if (cached && typeof cached === "object" && Array.isArray((cached as Baseline).panel)) {
    return cached as Baseline;
  }
  const settled = await Promise.allSettled(
    REFERENCE_PANEL.map(async (member): Promise<{ name: string; cities: CandidateCity[] }> => {
      const raw = await client.insights(cityHeatmapParams({ entityId: member.entityId }));
      return { name: member.name, cities: isHeatmapResponse(raw) ? cellsToCities(raw.results.heatmap) : [] };
    }),
  );
  const panel = settled
    .map((row) => (row.status === "fulfilled" ? row.value : null))
    .filter((row): row is { name: string; cities: CandidateCity[] } => row !== null);
  if (panel.length < Math.ceil(REFERENCE_PANEL.length * 0.75)) {
    return null;
  }
  const baseline = buildBaseline(panel);
  await store.cacheSet(BASELINE_CACHE_KEY, baseline);
  return baseline;
}

async function main() {
  const tours = JSON.parse(await readFile("data/backtest/tours.json", "utf8")) as TourEntry[];
  const client = createQlooClient();
  if (client.mode !== "live") {
    throw new Error("Backtest needs QLOO_MODE=live and QLOO_API_KEY.");
  }
  const baseline = await loadBaseline(client);
  if (!baseline) {
    throw new Error("Panel baseline could not be built (needs >= 75% of the panel).");
  }

  const results: ActResult[] = [];
  const skipped: { act: string; reason: string }[] = [];
  for (const entry of tours) {
    const realIds = [...new Set(entry.dates.map((row) => row.city))].filter((id) => marketIds.has(id));
    if (realIds.length === 0) {
      console.error(`skip ${entry.act} ${entry.tour}: no mappable cities`);
      continue;
    }
    const k = realIds.length;

    const found = await client.search({
      query: entry.act,
      types: entry.kind === "person" ? "urn:entity:person" : "urn:entity:artist,urn:entity:person",
      take: 5,
    });
    const match = matchSearchHit(entry.act, found.results.entities);
    if (!match.ok) {
      console.error(`skip ${entry.act}: no Qloo entity`);
      skipped.push({ act: entry.act, reason: "no matching Qloo entity" });
      continue;
    }
    let heat: Awaited<ReturnType<typeof client.insights>>;
    try {
      heat = await client.insights(cityHeatmapParams({ entityId: match.entity.entity_id }));
    } catch (error) {
      const reason = error instanceof Error ? error.message.slice(0, 160) : String(error);
      console.error(`skip ${entry.act}: heatmap unavailable (${reason})`);
      skipped.push({ act: entry.act, reason: "Qloo heatmap unavailable for this entity" });
      continue;
    }
    const candidates = isHeatmapResponse(heat) ? cellsToCities(heat.results.heatmap) : [];
    const scored = scoreCities(candidates, baseline);

    const liftTop = new Set(scored.slice(0, k).map(cityId));
    const metroTop = new Set(metroRank.slice(0, k));
    const combinedTop = new Set(
      combinedScores(scored, metroRank, METRO_POP_MILLIONS).slice(0, k).map((row) => row.id),
    );
    const liftHits = realIds.filter((id) => liftTop.has(id)).length;
    const metroHits = realIds.filter((id) => metroTop.has(id)).length;
    const combinedHits = realIds.filter((id) => combinedTop.has(id)).length;

    results.push({
      act: entry.act,
      tour: entry.tour,
      source: entry.source,
      realCities: realIds.length,
      k,
      liftHits,
      metroHits,
      combinedHits,
      liftRecall: liftHits / k,
      metroRecall: metroHits / k,
      combinedRecall: combinedHits / k,
    });
    console.log(`${entry.act}: lift ${liftHits}/${k}, metros ${metroHits}/${k}, combined ${combinedHits}/${k}`);
  }

  const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);
  const summary = {
    generatedAt: new Date().toISOString(),
    method:
      "Hit rate at K = distinct real tour cities mapped to the 36 Settlement markets. Qloo lift = 0.5 x normalized affinity + 0.5 x normalized lift vs the 12-act reference panel mean. Metros = top K by 2020 Census metro population. Combined = a fixed 50/50 blend of normalized metro population and lift score, declared before it was run and added after the first lift-vs-metros result. LLM-only baseline omitted: no paid spend.",
    combinedWeight: COMBINED_WEIGHT,
    acts: results.length,
    meanLiftRecall: mean(results.map((row) => row.liftRecall)),
    meanMetroRecall: mean(results.map((row) => row.metroRecall)),
    meanCombinedRecall: mean(results.map((row) => row.combinedRecall)),
    totalLiftHits: results.reduce((sum, row) => sum + row.liftHits, 0),
    totalMetroHits: results.reduce((sum, row) => sum + row.metroHits, 0),
    totalCombinedHits: results.reduce((sum, row) => sum + row.combinedHits, 0),
    totalCities: results.reduce((sum, row) => sum + row.k, 0),
    wins: {
      lift: results.filter((row) => row.liftHits > row.metroHits && row.liftHits > row.combinedHits).length,
      metros: results.filter((row) => row.metroHits > row.liftHits && row.metroHits > row.combinedHits).length,
      combined: results.filter((row) => row.combinedHits > row.liftHits && row.combinedHits > row.metroHits).length,
      ties: results.filter((row) => {
        const best = Math.max(row.liftHits, row.metroHits, row.combinedHits);
        const winners = [row.liftHits, row.metroHits, row.combinedHits].filter((h) => h === best).length;
        return winners > 1;
      }).length,
    },
    perAct: results,
    skipped,
  };
  await writeFile("data/backtest/results.json", `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`\nMean recall at K: lift ${(summary.meanLiftRecall * 100).toFixed(1)}%, metros ${(summary.meanMetroRecall * 100).toFixed(1)}%, combined ${(summary.meanCombinedRecall * 100).toFixed(1)}%`);
  console.log(`Wins: lift ${summary.wins.lift}, metros ${summary.wins.metros}, combined ${summary.wins.combined}, ties ${summary.wins.ties}`);
}

void main();
