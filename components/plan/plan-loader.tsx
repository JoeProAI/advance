"use client";

import { useEffect, useState } from "react";
import { DeskFailure } from "@/components/desk/desk-failure";
import { PlanView } from "@/components/plan/plan-view";
import {
  DESK_FAILURES,
  demoPartialPlan,
  deskCopyForPlanError,
  parseDeskState,
} from "@/lib/desk-states";
import type { TourPlan } from "@/lib/types";

export function PlanLoader({ id, fail }: { id: string; fail?: string | null }) {
  const forced = parseDeskState(fail);
  const [plan, setPlan] = useState<TourPlan | undefined>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (forced) {
      return;
    }
    let cancelled = false;
    const load = async () => {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        if (!cancelled) {
          setError(DESK_FAILURES.offline.body);
        }
        return;
      }
      const response = await fetch(`/api/plans/${id}`, { cache: "no-store" });
      if (!response.ok) {
        if (!cancelled) {
          setError(DESK_FAILURES["not-found"].body);
        }
        return;
      }
      const json = (await response.json()) as TourPlan;
      if (!cancelled) {
        setPlan(json);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [forced, id]);

  if (forced === "partial") {
    return <PlanView plan={demoPartialPlan()} />;
  }
  if (forced && forced !== "loading") {
    return <DeskFailure copy={DESK_FAILURES[forced === "invalid-date" ? "invalid-date" : forced]} />;
  }

  if (!plan && !error) {
    return (
      <div className="desk-stage px-6 py-16">
        <p className="ticket-kicker text-[var(--color-accent)]">Pulling the sheet</p>
        <h1 className="display mt-2 text-5xl">Loading the issue</h1>
        <p className="mt-3 max-w-md text-[var(--color-muted)]">
          The copy desk is opening a filed run. Stay on this stub.
        </p>
      </div>
    );
  }

  if (error && !plan) {
    return <DeskFailure copy={id === "missing" ? DESK_FAILURES["not-found"] : { ...DESK_FAILURES["not-found"], body: error }} />;
  }

  const failure = deskCopyForPlanError(error ?? plan?.error);
  if (failure && plan?.status === "error") {
    return <DeskFailure copy={failure} />;
  }

  return <PlanView plan={plan} error={error ?? plan?.error} />;
}
