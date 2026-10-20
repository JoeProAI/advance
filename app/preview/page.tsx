import { DeskFailure } from "@/components/desk/desk-failure";
import { LandingPage } from "@/components/landing/landing-page";
import { PlanView } from "@/components/plan/plan-view";
import {
  DESK_FAILURES,
  demoLoadingPlan,
  demoLoadingSteps,
  demoPartialPlan,
  parseDeskState,
} from "@/lib/desk-states";

export const dynamic = "force-dynamic";

export default async function PreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const state = parseDeskState((await searchParams).state);
  if (!state) {
    return <LandingPage />;
  }
  if (state === "loading") {
    const plan = demoLoadingPlan();
    return <PlanView plan={plan} steps={demoLoadingSteps()} live error={undefined} />;
  }
  if (state === "partial") {
    return <PlanView plan={demoPartialPlan()} />;
  }
  if (state === "invalid-date") {
    return <LandingPage fail="invalid-date" />;
  }
  return <DeskFailure copy={DESK_FAILURES[state]} />;
}
