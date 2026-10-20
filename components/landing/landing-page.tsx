"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DeskFailure } from "@/components/desk/desk-failure";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { APP_NAME, APP_TAGLINE, EXAMPLE_ACTS } from "@/lib/config";
import { DESK_FAILURES, parseDeskState } from "@/lib/desk-states";
import { defaultTourStartDate } from "@/lib/routing/plan";

function toRunHref(params: Record<string, string>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      search.set(key, value);
    }
  }
  return `/run?${search.toString()}`;
}

export function LandingPage({ fail }: { fail?: string | null }) {
  const router = useRouter();
  const forced = parseDeskState(fail);
  const [error, setError] = useState<string | null>(
    forced === "invalid-date" ? DESK_FAILURES["invalid-date"].body : null,
  );
  const [pending, setPending] = useState(false);
  const firstDate = defaultTourStartDate();
  const featured = EXAMPLE_ACTS[0];
  const listings = EXAMPLE_ACTS.slice(1);

  if (forced && forced !== "invalid-date" && forced !== "loading" && forced !== "partial") {
    return <DeskFailure copy={DESK_FAILURES[forced]} />;
  }

  return (
    <div className="desk-stage relative min-h-full overflow-x-hidden">
      <header className="masthead px-5 pt-6 pb-4 md:px-10">
        <p className="ticket-kicker text-[var(--color-accent)]">Qloo listings · weekly issue</p>
        <p className="display text-center text-5xl md:text-6xl">{APP_NAME}</p>
        <p className="text-sm text-[var(--color-muted)] md:text-right">
          Walk up. One run. A plate you can hand to a booker.
        </p>
      </header>
      <div className="masthead-rule mx-5 md:mx-10" />

      <section className="grid items-start gap-10 px-5 pt-8 pb-8 md:grid-cols-12 md:px-10">
        <div className="md:col-span-7 xl:col-span-8">
          <p className="ticket-kicker text-[var(--color-muted)]">Vol. 1 · taste listings</p>
          <h1 className="display mt-3 text-[clamp(3rem,8vw,6.8rem)]">
            Start where
            <br />
            they already
            <br />
            <span className="display-italic text-[var(--color-accent)]">live.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg">{APP_TAGLINE}</p>
          <p className="mt-3 max-w-xl text-[var(--color-muted)]">
            Qloo heatmaps name the cities. The issue routes a drivable run, picks rooms that share the
            crowd, names local openers, and writes a promo brief for each stop.
          </p>
        </div>

        <form
          className="paper relative p-5 md:col-span-5 md:mt-16 xl:col-span-4"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const actName = String(form.get("actName") ?? "").trim();
            const startDate = String(form.get("startDate") ?? "");
            if (!actName) {
              setError("Type a musician or comedian.");
              return;
            }
            if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
              setError(DESK_FAILURES["invalid-date"].body);
              return;
            }
            setPending(true);
            router.push(
              toRunHref({
                actName,
                showCount: String(form.get("showCount") ?? "8"),
                maxDriveHours: String(form.get("maxDriveHours") ?? "5"),
                homeCity: String(form.get("homeCity") ?? ""),
                budgetTier: String(form.get("budgetTier") ?? "either"),
                startDate,
              }),
            );
          }}
        >
          <div className="absolute -top-3 right-4 rotate-3 bg-[var(--color-accent)] px-2 py-1 font-mono text-[length:var(--text-xs)] uppercase tracking-[var(--letter-ticket)] text-[var(--color-paper)]">
            Advance sheet
          </div>
          <p className="ticket-kicker text-[var(--color-ink)]">Classified · copy desk</p>
          <div className="mt-4 grid gap-3">
            <Field label="Act" error={error && !error.includes("calendar") ? error : undefined}>
              <Input
                name="actName"
                placeholder="Musician or comedian"
                autoComplete="off"
                tone="paper"
                aria-invalid={Boolean(error && !error.includes("calendar"))}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Shows">
                <Input name="showCount" type="number" min={3} max={12} defaultValue={8} tone="paper" />
              </Field>
              <Field label="Max drive">
                <Input name="maxDriveHours" type="number" min={2} max={12} defaultValue={5} tone="paper" />
              </Field>
            </div>
            <Field label="Home city" hint="Optional start. Leave blank to begin at the hottest city.">
              <Input name="homeCity" placeholder="Chicago" tone="paper" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Rooms">
                <Select name="budgetTier" defaultValue="either" tone="paper">
                  <option value="rooms">Small rooms</option>
                  <option value="either">Either</option>
                  <option value="theaters">Theaters</option>
                </Select>
              </Field>
              <Field
                label="First date"
                hint="About eight weeks out by default."
                error={error?.includes("calendar") ? error : undefined}
              >
                <Input
                  name="startDate"
                  type="date"
                  defaultValue={forced === "invalid-date" ? "" : firstDate}
                  tone="paper"
                  aria-invalid={Boolean(error?.includes("calendar"))}
                />
              </Field>
            </div>
            <Button type="submit" variant="stamp" loading={pending} className="mt-1 w-full">
              {pending ? "Setting type" : "File the run"}
            </Button>
          </div>
        </form>
      </section>

      <section className="px-5 pb-16 md:px-10">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="ticket-kicker text-[var(--color-accent)]">Classifieds · three acts on file</p>
            <h2 className="display text-3xl md:text-5xl">Tear a coupon.</h2>
          </div>
          <p className="hidden max-w-xs text-right text-sm text-[var(--color-muted)] md:block">
            One featured listing, two more on the spike. Stamp any coupon to file a run.
          </p>
        </div>

        <div className="classifieds">
          {featured ? (
            <Link
              href={toRunHref({
                example: featured.slug,
                showCount: String(featured.defaults.showCount),
                maxDriveHours: String(featured.defaults.maxDriveHours),
                startDate: firstDate,
              })}
              className="ticket-notch ticket-link paper"
            >
              <div className="flex items-start justify-between">
                <span className="highway-shield">01</span>
                <span className="rotate-2 border border-[var(--color-accent)] px-2 py-1 font-mono text-[length:var(--text-xs)] uppercase tracking-[var(--letter-ticket)] text-[var(--color-accent)]">
                  {featured.stamp}
                </span>
              </div>
              <p className="ticket-kicker mt-5 text-[var(--color-ink)]">{featured.role}</p>
              <h3 className="display mt-1 text-4xl text-[var(--color-ink)] md:text-5xl">{featured.name}</h3>
              <p className="mt-3 max-w-md text-[var(--color-ink)]">{featured.blurb}</p>
              <p className="ticket-kicker mt-5 text-[var(--color-ink)]">Stamp this coupon</p>
            </Link>
          ) : null}
          <ol className="classified-stack">
            {listings.map((act, index) => (
              <li key={act.slug}>
                <Link
                  href={toRunHref({
                    example: act.slug,
                    showCount: String(act.defaults.showCount),
                    maxDriveHours: String(act.defaults.maxDriveHours),
                    startDate: firstDate,
                  })}
                  className="ticket-notch ticket-link paper"
                >
                  <div className="flex items-start justify-between">
                    <span className="highway-shield">{String(index + 2).padStart(2, "0")}</span>
                    <span className="rotate-2 border border-[var(--color-accent)] px-2 py-1 font-mono text-[length:var(--text-xs)] uppercase tracking-[var(--letter-ticket)] text-[var(--color-accent)]">
                      {act.stamp}
                    </span>
                  </div>
                  <p className="ticket-kicker mt-4 text-[var(--color-ink)]">{act.role}</p>
                  <h3 className="display mt-1 text-3xl text-[var(--color-ink)]">{act.name}</h3>
                  <p className="mt-2 text-sm text-[var(--color-ink)]">{act.blurb}</p>
                  <p className="ticket-kicker mt-4 text-[var(--color-ink)]">Stamp this coupon</p>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <footer className="flex flex-col gap-3 border-t border-[var(--color-text)] px-5 py-6 text-sm text-[var(--color-muted)] md:flex-row md:items-center md:justify-between md:px-10">
        <p>
          {APP_NAME} is a Qloo Agentic Hackathon entry. MIT licensed. Taste data via Qloo. Routing
          and copy by the listings desk.
        </p>
        <p className="ticket-kicker">Walk-up counter · mock issue first</p>
      </footer>
    </div>
  );
}
