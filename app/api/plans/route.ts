import { runTourAgent } from "@/lib/agent/run";
import { parsePlanRequest } from "@/lib/plan-request";
import { checkPlanRateLimit, clientIp } from "@/lib/rate-limit";
import { getPlanStore } from "@/lib/storage";
import { createId } from "@/lib/utils";
import type { TourPlan } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  const limit = checkPlanRateLimit(clientIp(request.headers));
  if (!limit.ok) {
    return Response.json(
      { error: `New plans are limited to 5 per hour from one address. Try again in ${limit.retryAfterSec}s.` },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Send a JSON body." }, { status: 400 });
  }

  let parsed;
  try {
    parsed = parsePlanRequest(body);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Invalid request" },
      { status: 400 },
    );
  }

  const store = getPlanStore();
  const now = Date.now();
  const plan: TourPlan = {
    id: createId("adv"),
    status: "running",
    createdAt: now,
    updatedAt: now,
    request: parsed,
    act: null,
    steps: [],
    route: null,
    summary: "",
    qlooMode: process.env.QLOO_MODE === "live" ? "live" : "mock",
    writer: process.env.OPENROUTER_API_KEY ? "openrouter" : "fallback",
    thinData: false,
  };
  await store.create(plan);

  const finish = async (): Promise<TourPlan> => {
    try {
      const result = await runTourAgent(parsed, {
        onStep: async (step) => {
          await store.appendStep(plan.id, step);
        },
      });
      const finished: TourPlan = {
        ...plan,
        ...result,
        id: plan.id,
        createdAt: plan.createdAt,
        updatedAt: Date.now(),
      };
      await store.save(finished);
      return finished;
    } catch (error) {
      const failed: TourPlan = {
        ...plan,
        status: "error",
        error: error instanceof Error ? error.message : "The desk could not finish this run.",
        updatedAt: Date.now(),
      };
      await store.save(failed);
      return failed;
    }
  };

  const wantsStream =
    request.headers.get("accept")?.includes("text/event-stream") ||
    new URL(request.url).searchParams.get("stream") === "1";

  if (!wantsStream) {
    const finished = await finish();
    return Response.json(finished, { status: finished.status === "error" ? 500 : 200 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };
      send({ type: "created", id: plan.id });
      const result = await runTourAgent(parsed, {
        onStep: async (agentStep) => {
          await store.appendStep(plan.id, agentStep);
          send({ type: "step", step: agentStep, id: plan.id });
        },
      }).catch((error: unknown) => {
        const failed: TourPlan = {
          ...plan,
          status: "error" as const,
          error: error instanceof Error ? error.message : "The desk could not finish this run.",
          updatedAt: Date.now(),
        };
        return failed;
      });
      const finished: TourPlan =
        "id" in result && result.id === plan.id
          ? { ...plan, ...result, id: plan.id, createdAt: plan.createdAt, updatedAt: Date.now() }
          : {
              ...plan,
              ...result,
              id: plan.id,
              createdAt: plan.createdAt,
              updatedAt: Date.now(),
            };
      await store.save(finished);
      send({ type: "done", plan: finished });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
