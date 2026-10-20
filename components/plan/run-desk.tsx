"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { DeskFailure } from "@/components/desk/desk-failure";
import { PlanView } from "@/components/plan/plan-view";
import { deskCopyForPlanError } from "@/lib/desk-states";
import type { AgentStep, TourPlan } from "@/lib/types";

export function RunDesk({ payload }: { payload: Record<string, string> }) {
  const router = useRouter();
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [plan, setPlan] = useState<TourPlan | undefined>();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) {
      return;
    }
    started.current = true;
    const abort = new AbortController();

    const run = async () => {
      try {
        const response = await fetch("/api/plans?stream=1", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
          },
          body: JSON.stringify(payload),
          signal: abort.signal,
        });
        if (!response.ok || !response.body) {
          const failed = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(failed?.error ?? "The desk could not open this run.");
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split("\n\n");
          buffer = chunks.pop() ?? "";
          for (const chunk of chunks) {
            const line = chunk
              .split("\n")
              .filter((row) => row.startsWith("data:"))
              .map((row) => row.slice(5).trim())
              .join("");
            if (!line) {
              continue;
            }
            const event = JSON.parse(line) as
              | { type: "created"; id: string }
              | { type: "step"; step: AgentStep }
              | { type: "done"; plan: TourPlan };
            if (event.type === "step") {
              setSteps((current) => [...current, event.step]);
            }
            if (event.type === "done") {
              setPlan(event.plan);
              setSteps(event.plan.steps);
              if (event.plan.status === "error") {
                setError(event.plan.error ?? "Run failed.");
              } else {
                router.replace(`/plan/${event.plan.id}`);
              }
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          return;
        }
        setError(err instanceof Error ? err.message : "Run failed.");
      }
    };

    void run();
    return () => abort.abort();
  }, [payload, router]);

  const failure = deskCopyForPlanError(error ?? plan?.error);
  if (failure && (!plan || plan.status === "error")) {
    return <DeskFailure copy={failure} />;
  }

  return <PlanView plan={plan} steps={steps} live={!plan || plan.status === "running"} error={error ?? undefined} />;
}
