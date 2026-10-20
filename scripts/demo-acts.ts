import { runTourAgent } from "../lib/agent/run";
import type { PlanRequest } from "../lib/types";

async function main(): Promise<void> {
  const acts: PlanRequest[] = [
    {
      actName: "MJ Lenderman",
      kindHint: "artist",
      showCount: 8,
      maxDriveHours: 5,
      budgetTier: "either",
    },
    {
      actName: "Sam Morril",
      kindHint: "person",
      showCount: 8,
      maxDriveHours: 5,
      budgetTier: "rooms",
    },
    {
      actName: "Wednesday",
      kindHint: "artist",
      showCount: 8,
      maxDriveHours: 5,
      budgetTier: "either",
    },
    {
      actName: "Ada Wren Trio",
      kindHint: "artist",
      showCount: 6,
      maxDriveHours: 6,
      budgetTier: "rooms",
      homeCity: "Chicago",
    },
  ];

  for (const request of acts) {
    const plan = await runTourAgent(request);
    const cities = plan.route?.stops.map((stop) => stop.city.name).join(" -> ") ?? "NONE";
    console.log(
      `${plan.status}  ${plan.act?.name ?? request.actName}  stops=${plan.route?.stops.length ?? 0}  writer=${plan.writer}  ${cities}${
        plan.error ? `  ERROR ${plan.error}` : ""
      }`,
    );
    if (plan.status !== "ready" || !plan.route) {
      process.exitCode = 1;
    }
  }
}

void main();
