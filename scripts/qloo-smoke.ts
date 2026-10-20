/**
 * Day-one live checks once QLOO_API_KEY is set.
 * Usage: QLOO_MODE=live QLOO_API_KEY=... npm run smoke
 *
 * The hackathon key only works against https://hackathon.api.qloo.com
 * About 6 Qloo calls. Prints counts and names only, never raw payloads.
 */
import { createQlooClient, isHeatmapResponse } from "../lib/qloo/client";
import { cellsToCities, matchSearchHit } from "../lib/qloo/parse";
import { PLACE_TAGS, cityHeatmapParams } from "../lib/qloo/request";

async function main(): Promise<void> {
  const mode = process.env.QLOO_MODE === "live" ? "live" : "mock";
  if (mode === "live" && !process.env.QLOO_API_KEY) {
    console.error("Set QLOO_API_KEY (and QLOO_MODE=live) before running live smoke.");
    process.exit(1);
  }

  const client = createQlooClient(mode);
  const report: Array<{ check: string; ok: boolean; detail: string }> = [];

  const band = await client.search({ query: "MJ Lenderman", types: "urn:entity:artist", take: 3 });
  const bandHit = matchSearchHit("MJ Lenderman", band.results.entities);
  report.push({
    check: "search (plain results array)",
    ok: bandHit.ok,
    detail: band.results.entities.map((entity) => entity.name).join("; ") || "empty",
  });
  const bandId = bandHit.ok ? bandHit.entity.entity_id : "missing";

  const heatmap = await client.insights(cityHeatmapParams({ entityId: bandId }));
  const cells = isHeatmapResponse(heatmap) ? heatmap.results.heatmap : [];
  const cities = cellsToCities(cells);
  report.push({
    check: "urn:heatmap over CONUS WKT",
    ok: cities.length > 0,
    detail: `${cells.length} cells, ${cities.length} tour cities. Top: ${cities
      .slice(0, 5)
      .map((city) => `${city.name} ${city.affinity.toFixed(2)}`)
      .join(", ")}`,
  });

  const venues = await client.insights({
    "filter.type": "urn:entity:place",
    "filter.tags": PLACE_TAGS.musicVenue,
    "filter.location.query": "Chicago",
    "signal.interests.entities": bandId,
    take: 5,
  });
  report.push({
    check: "music venues by fixed tag",
    ok: !isHeatmapResponse(venues) && venues.results.entities.length > 0,
    detail: isHeatmapResponse(venues) ? "heatmap?" : venues.results.entities.map((entity) => entity.name).join("; "),
  });

  const comic = await client.search({ query: "Sam Morril", types: "urn:entity:person", take: 3 });
  report.push({
    check: "comedians as person entities",
    ok: comic.results.entities.length > 0,
    detail: comic.results.entities.map((entity) => `${entity.name} (${(entity.types ?? [entity.subtype]).join(",")})`).join("; ") || "empty",
  });

  const compare = await client.compare(
    [bandId],
    comic.results.entities[0] ? [comic.results.entities[0].entity_id] : ["missing"],
  );
  report.push({
    check: "/v2/insights/compare",
    ok: compare.success,
    detail: `overlap=${compare.results.overlap.toFixed(2)} (${compare.results.shared_tags.join(", ")})`,
  });

  const trends = await client.trends(bandId);
  report.push({
    check: "trends (skipped live)",
    ok: true,
    detail: trends.results.note,
  });

  console.log(`Qloo smoke (${mode}), ${client.calls} calls`);
  for (const row of report) {
    console.log(`${row.ok ? "PASS" : "FAIL"}  ${row.check}`);
    console.log(`       ${row.detail}`);
  }
  if (report.some((row) => !row.ok)) {
    process.exit(2);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
