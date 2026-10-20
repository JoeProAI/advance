/**
 * Live end-to-end run for the three demo tickets.
 * Usage: QLOO_MODE=live npx tsx scripts/live-e2e.ts [slug ...]
 * Leave OPENROUTER_API_KEY unset to use the deterministic writer (no spend).
 * Saves plans to the file store (.data/, gitignored) and prints a summary of
 * names and counts only. Never prints keys or raw payloads.
 */
import { runTourAgent } from "../lib/agent/run";
import { EXAMPLE_ACTS } from "../lib/config";
import { parsePlanRequest } from "../lib/plan-request";
import { getPlanStore } from "../lib/storage";
import { createId } from "../lib/utils";

let qlooCalls = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  if (String(input instanceof Request ? input.url : input).startsWith("https://hackathon.api.qloo.com")) {
    qlooCalls += 1;
  }
  return realFetch(input, init);
}) as typeof fetch;

async function run(slug: string) {
  const before = qlooCalls;
  const started = Date.now();
  // Same request a demo link sends (EXAMPLE_ACTS defaults), so keys match the warm cache.
  const parsed = parsePlanRequest({ example: slug });
  const result = await runTourAgent(parsed);
  const now = Date.now();
  const plan = { ...result, id: createId("adv"), createdAt: now, updatedAt: now };
  await getPlanStore().save(plan);
  const stops = plan.route?.stops ?? [];
  return {
    id: plan.id,
    act: plan.act?.name,
    kind: plan.act?.kind,
    status: plan.status,
    error: plan.error,
    writer: plan.writer,
    qlooMode: plan.qlooMode,
    thinData: plan.thinData,
    networkCalls: qlooCalls - before,
    seconds: Math.round((Date.now() - started) / 100) / 10,
    totalMiles: Math.round(plan.route?.totalMiles ?? 0),
    warnings: plan.steps.filter((step) => step.status !== "done").map((step) => `${step.title}: ${step.detail}`),
    uniqueOpeners: new Set(stops.flatMap((stop) => stop.openers.map((opener) => opener.name))).size,
    openerSlots: stops.reduce((sum, stop) => sum + stop.openers.length, 0),
    localOpeners: stops.reduce((sum, stop) => sum + stop.openers.filter((opener) => opener.local).length, 0),
    dropped: plan.steps.find((step) => step.title === "Dropped implausible openers")?.detail,
    stops: stops.map((stop) => ({
      date: stop.date,
      city: stop.city.name,
      score: Number(stop.affinity.toFixed(3)),
      venue: stop.venue.name,
      room: stop.venue.estimatedRoom,
      why: stop.venue.why,
      openers: stop.openers.map(
        (opener) =>
          `${opener.name} (${typeof opener.overlap === "number" ? `ov ${opener.overlap.toFixed(2)}` : `aff ${opener.affinity.toFixed(2)}`}${opener.local ? ", local" : ""})`,
      ),
      podcasts: stop.brief.podcasts.length,
      bars: stop.brief.bars.length,
      brands: stop.brief.brands.length,
    })),
  };
}

async function main() {
  const slugs = process.argv.slice(2);
  const wanted = slugs.length ? slugs : EXAMPLE_ACTS.map((act) => act.slug);
  for (const slug of wanted) {
    console.log(JSON.stringify(await run(slug), null, 2));
  }
}

void main();
