/**
 * Pre-warm the server-side Qloo cache for the three demo acts.
 *
 * Run once per deploy, from a machine with the production env loaded
 * (QLOO_MODE=live, the Qloo key, CONVEX_URL, ADVANCE_STORE_SECRET):
 *   npx tsx scripts/warm-cache.ts
 * Without CONVEX_URL it warms the local file cache (.data/cache).
 *
 * Uses the same request each demo link sends (EXAMPLE_ACTS defaults), so the
 * cache keys match. No plans are saved and the writer stays on the
 * deterministic fallback (no model spend). Prints counts only.
 */
import { runTourAgent } from "../lib/agent/run";
import { EXAMPLE_ACTS } from "../lib/config";
import { parsePlanRequest } from "../lib/plan-request";
import { getPlanStore } from "../lib/storage";

delete process.env.OPENROUTER_API_KEY;

let qlooCalls = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  if (String(input instanceof Request ? input.url : input).startsWith("https://hackathon.api.qloo.com")) {
    qlooCalls += 1;
  }
  return realFetch(input, init);
}) as typeof fetch;

/** Warming is offline work, so it gets more time than a visitor's run. */
const WARM_BUDGET_MS = 180_000;

async function main() {
  if (process.env.QLOO_MODE !== "live") {
    console.log("QLOO_MODE is not live; nothing to warm.");
    return;
  }
  const store = getPlanStore();
  const slugs = process.argv.slice(2);
  const acts = slugs.length ? EXAMPLE_ACTS.filter((act) => slugs.includes(act.slug)) : EXAMPLE_ACTS;
  for (const act of acts) {
    const before = qlooCalls;
    const started = Date.now();
    const result = await runTourAgent(parsePlanRequest({ example: act.slug }), {}, WARM_BUDGET_MS);
    const warnings = result.steps.filter((step) => step.status !== "done").length;
    console.log(
      JSON.stringify({
        act: act.slug,
        store: store.kind,
        status: result.status,
        stops: result.route?.stops.length ?? 0,
        networkCalls: qlooCalls - before,
        seconds: Math.round((Date.now() - started) / 100) / 10,
        warnings,
      }),
    );
  }
}

void main();
