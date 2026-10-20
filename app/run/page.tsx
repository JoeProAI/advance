import Link from "next/link";
import { EXAMPLE_ACTS } from "@/lib/config";
import { RunDesk } from "@/components/plan/run-desk";

export const dynamic = "force-dynamic";

type Search = {
  actName?: string;
  example?: string;
  showCount?: string;
  maxDriveHours?: string;
  homeCity?: string;
  budgetTier?: string;
  startDate?: string;
  kindHint?: string;
};

export default async function RunPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const params = await searchParams;
  const example = EXAMPLE_ACTS.find((act) => act.slug === params.example);
  const payload: Record<string, string> = {};
  if (params.example) {
    payload.example = params.example;
  }
  if (params.actName) {
    payload.actName = params.actName;
  } else if (example) {
    payload.actName = example.name;
    payload.kindHint = example.kind;
  }
  if (params.showCount) payload.showCount = params.showCount;
  if (params.maxDriveHours) payload.maxDriveHours = params.maxDriveHours;
  if (params.homeCity) payload.homeCity = params.homeCity;
  if (params.budgetTier) payload.budgetTier = params.budgetTier;
  if (params.startDate) payload.startDate = params.startDate;
  if (params.kindHint) payload.kindHint = params.kindHint;

  if (!payload.actName && !payload.example) {
    return (
      <main className="desk-stage px-6 py-16">
        <h1 className="display text-4xl">No act on the sheet.</h1>
        <p className="mt-3 text-[var(--color-muted)]">
          Go back to the desk and type a name, or stamp one of the three tickets.
        </p>
        <Link href="/" className="desk-link mt-6">
          Return to the desk
        </Link>
      </main>
    );
  }

  return <RunDesk payload={payload} />;
}
