/**
 * Day-one live checks once QLOO_API_KEY is set.
 * Usage: QLOO_MODE=live QLOO_API_KEY=... npm run smoke
 *
 * The hackathon key only works against https://hackathon.api.qloo.com
 */
import { createQlooClient, isHeatmapResponse } from "../lib/qloo/client";
import { cityHeatmapParams } from "../lib/qloo/request";

async function main(): Promise<void> {
  const mode = process.env.QLOO_MODE === "live" ? "live" : "mock";
  if (mode === "live" && !process.env.QLOO_API_KEY) {
    console.error("Set QLOO_API_KEY (and QLOO_MODE=live) before running live smoke.");
    process.exit(1);
  }

  const client = createQlooClient(mode);
  const report: Array<{ check: string; ok: boolean; detail: string }> = [];

  const heatmap = await client.insights(
    cityHeatmapParams({
      entityId: "00000000-1111-4000-8000-000000000001",
      locationQuery: "Midwest United States",
      take: 10,
    }),
  );
  if (isHeatmapResponse(heatmap)) {
    const named = heatmap.results.heatmap.filter((cell) => cell.location.name).length;
    report.push({
      check: "city-level heatmap",
      ok: heatmap.results.heatmap.length > 0,
      detail: `${heatmap.results.heatmap.length} cells, ${named} with location.name. Confirm output.heatmap.boundary=city vs neighborhood.`,
    });
  } else {
    report.push({
      check: "city-level heatmap",
      ok: false,
      detail: "Response had no results.heatmap — parameter likely ignored.",
    });
  }

  const venueTags = await client.tags("music venue");
  const comedyTags = await client.tags("comedy club");
  report.push({
    check: "venue tag ids",
    ok: venueTags.results.tags.length > 0,
    detail: `music venue: ${venueTags.results.tags
      .slice(0, 3)
      .map((tag) => tag.id ?? tag.tag_id)
      .join(", ")}; comedy: ${comedyTags.results.tags
      .slice(0, 3)
      .map((tag) => tag.id ?? tag.tag_id)
      .join(", ")}`,
  });

  const comic = await client.search({
    query: "Cedric the Entertainer",
    types: "urn:entity:person",
    take: 3,
  });
  report.push({
    check: "comedians as person entities",
    ok: comic.results.entities.length > 0,
    detail: comic.results.entities.map((entity) => `${entity.name} (${entity.subtype ?? entity.type})`).join("; ") || "empty",
  });

  const compare = await client.compare(
    comic.results.entities[0] ? [comic.results.entities[0].entity_id] : ["missing"],
    ["missing-opener"],
  );
  report.push({
    check: "/v2/insights/compare",
    ok: Boolean(compare.results),
    detail: compare.results.note || `overlap=${compare.results.overlap}`,
  });

  const trends = comic.results.entities[0]
    ? await client.trends(comic.results.entities[0].entity_id)
    : { success: false, results: { available: false, note: "no person entity" } };
  report.push({
    check: "/trends/entity",
    ok: trends.results.available || Boolean(trends.results.note),
    detail: trends.results.note || `delta=${trends.results.delta}`,
  });

  console.log(`Qloo smoke (${mode}) against ${process.env.QLOO_BASE_URL ?? "https://hackathon.api.qloo.com"}`);
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
