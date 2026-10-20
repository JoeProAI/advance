import { runTourAgent } from "../lib/agent/run";
import { parsePlanRequest } from "../lib/plan-request";
import { getPlanStore } from "../lib/storage";
import { createId } from "../lib/utils";

async function saveExample(example: string) {
  const parsed = parsePlanRequest({ example, showCount: 8, maxDriveHours: 5 });
  const result = await runTourAgent(parsed);
  const now = Date.now();
  const plan = { ...result, id: createId("adv"), createdAt: now, updatedAt: now };
  await getPlanStore().save(plan);
  const stops = plan.route?.stops ?? [];
  console.log(
    JSON.stringify(
      {
        id: plan.id,
        act: plan.act?.name,
        startDate: plan.request.startDate,
        status: plan.status,
        error: plan.error,
        dates: stops.map((stop) => stop.date),
        rows: stops.map((stop) => ({
          city: stop.city.name,
          venue: stop.venue.name,
          cap: stop.venue.estimatedRoom,
          why: stop.venue.why,
          openers: stop.openers.map((opener) => opener.name),
        })),
      },
      null,
      2,
    ),
  );
}

async function main() {
  await saveExample("marlow");
  await saveExample("rina");
}

void main();
