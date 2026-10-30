"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { APP_NAME } from "@/lib/config";
import { cityId } from "@/lib/scoring/lift";
import type { AgentStep, RoutedStop, TourPlan } from "@/lib/types";
import { formatAffinity, formatHours, formatMiles } from "@/lib/utils";
import { AgentLog } from "@/components/plan/agent-log";
import { StopBrief } from "@/components/plan/stop-brief";
import { TourMap } from "@/components/plan/tour-map";
import { Button } from "@/components/ui/button";

type PlanViewProps = {
  plan?: TourPlan;
  steps?: AgentStep[];
  live?: boolean;
  error?: string;
};

export function PlanView({ plan, steps, live, error }: PlanViewProps) {
  const [openStop, setOpenStop] = useState<RoutedStop | null>(null);
  const [copied, setCopied] = useState(false);
  const [receiptsOpen, setReceiptsOpen] = useState(false);
  const [routeView, setRouteView] = useState<"with" | "without">("with");
  const receipts = plan?.receipts;
  const withoutQloo = plan?.withoutQloo;
  const log = steps ?? plan?.steps ?? [];
  const stops = useMemo(() => plan?.route?.stops ?? [], [plan]);
  const boardById = useMemo(
    () => new Map((plan?.cityBoard ?? []).map((row) => [`${row.name}, ${row.region}`, row])),
    [plan],
  );
  const sharedSet = useMemo(() => new Set(withoutQloo?.shared ?? []), [withoutQloo]);
  const qlooOnlyStops = stops.filter((stop) => !sharedSet.has(cityId(stop.city)));
  const changedCount = withoutQloo ? qlooOnlyStops.length : 0;
  const mapStops: RoutedStop[] = useMemo(() => {
    if (routeView !== "without" || !withoutQloo) {
      return stops;
    }
    return withoutQloo.cities.map(
      (city, index): RoutedStop => ({
        order: index + 1,
        date: "",
        city: { name: city.name, region: city.region, country: "US", lat: city.lat, lon: city.lon },
        affinity: 0,
        affinityRank: 0,
        venue: {
          entityId: "",
          name: "",
          city: city.name,
          affinity: 0,
          popularity: 0,
          estimatedRoom: "",
          why: "",
          tags: [],
        },
        openers: [],
        overlap: 0,
        brief: { audience: "", podcasts: [], bars: [], brands: [], socialPost: "" },
        driveHoursFromPrev: 0,
        milesFromPrev: 0,
      }),
    );
  }, [routeView, withoutQloo, stops]);
  const shareUrl = useMemo(() => {
    if (!plan || typeof window === "undefined") {
      return "";
    }
    return `${window.location.origin}/plan/${plan.id}`;
  }, [plan]);

  const selectStop = (stop: RoutedStop) => {
    setOpenStop(stop);
    const row = document.getElementById(`stop-${stop.order}`);
    row?.scrollIntoView({ block: "nearest" });
  };

  return (
    <div className="desk-stage min-h-full">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--color-line)] px-5 py-5 md:px-8">
        <div>
          <Link href="/" className="desk-link ticket-kicker">
            {APP_NAME} issue
          </Link>
          <h1 className="display mt-1 text-4xl md:text-6xl">
            {plan?.act?.name ?? (live ? "Routing" : "Tour sheet")}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--color-muted)]">
            {plan?.summary ||
              (live ? "The plate is filling. Each line in the log is a Qloo call." : "Shareable one-sheet.")}
          </p>
        </div>
        {plan?.status === "ready" ? (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="carbon"
              onClick={async () => {
                if (!shareUrl) {
                  return;
                }
                await navigator.clipboard.writeText(shareUrl);
                setCopied(true);
              }}
            >
              {copied ? "Link on the stub" : "Copy share link"}
            </Button>
            <a href={`/api/plans/${plan.id}/csv`} className="desk-link">
              <Button variant="ghost">Export CSV</Button>
            </a>
            {receipts ? (
              <>
                <Button
                  variant="ghost"
                  onClick={() => setReceiptsOpen(true)}
                  aria-expanded={receiptsOpen}
                >
                  {receipts.totals.calls} Qloo calls · {(receipts.totals.ms / 1000).toFixed(1)} s ·{" "}
                  {receipts.invented} invented
                </Button>
                <a href={`/api/plans/${plan.id}/receipt`} className="desk-link">
                  <Button variant="ghost">Download receipt JSON</Button>
                </a>
              </>
            ) : null}
          </div>
        ) : live ? (
          <Button variant="ghost" disabled loading>
            Filing the run
          </Button>
        ) : null}
      </header>

      {error ? (
        <p
          className="fail-sheet mx-5 mt-4 text-sm md:mx-8"
          role="alert"
        >
          {error}{" "}
          <Link href="/" className="desk-link">
            Return to the issue
          </Link>
        </p>
      ) : null}

      {plan?.thinData ? (
        <p className="fail-sheet mx-5 mt-4 text-sm md:mx-8" data-kind="hold" role="status">
          Coverage is thin on at least one stop. The issue leaves that room on hold.
        </p>
      ) : null}

      {withoutQloo && stops.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--color-line)] px-5 py-3 md:px-8">
          <div className="flex gap-1" role="tablist" aria-label="Route comparison">
            <button
              type="button"
              role="tab"
              aria-selected={routeView === "with"}
              onClick={() => setRouteView("with")}
              className={`btn ${routeView === "with" ? "btn-carbon" : "btn-ghost"}`}
            >
              With Qloo
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={routeView === "without"}
              onClick={() => setRouteView("without")}
              className={`btn ${routeView === "without" ? "btn-carbon" : "btn-ghost"}`}
            >
              Without Qloo (biggest metros)
            </button>
          </div>
          <p className="text-sm text-[var(--color-muted)]">
            Qloo changed {changedCount} of {stops.length} stops.
          </p>
        </div>
      ) : null}

      <div className="grid items-start gap-0 xl:grid-cols-[1.15fr_0.85fr]">
        <TourMap
          stops={mapStops}
          selectedOrder={routeView === "with" ? openStop?.order : undefined}
          onSelect={routeView === "with" ? selectStop : () => undefined}
        />
        <aside className="border-t border-[var(--color-line)] xl:border-t-0 xl:border-l">
          <div className="border-b border-[var(--color-line)] px-4 py-3">
            <p className="ticket-kicker text-[var(--color-muted)]">Dispatch log</p>
            <p className="text-sm text-[var(--color-muted)]">
              {live ? "Calls still landing on this plate." : "The radio copy that filled this plate."}
            </p>
          </div>
          <div className="dispatch-log">
            <AgentLog steps={log} live={live} />
          </div>
        </aside>
      </div>

      {plan?.cityBoard?.length ? (
        <section className="border-b border-[var(--color-line)] px-5 py-6 md:px-8">
          <h2 className="display text-3xl">Why these cities</h2>
          <p className="mt-1 max-w-3xl text-sm text-[var(--color-muted)]">
            {plan.scoring?.baselineLoaded
              ? `${plan.scoring.method}. Panel: ${plan.scoring.panel.join(", ")}.`
              : "Ranked by Qloo affinity for this act (no baseline loaded)."}
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[46rem] border-collapse text-left text-sm">
              <thead className="ticket-kicker text-[var(--color-muted)]">
                <tr>
                  <th className="border-b border-[var(--color-line)] py-2 pr-3">City</th>
                  <th className="border-b border-[var(--color-line)] py-2 pr-3">Affinity</th>
                  <th className="border-b border-[var(--color-line)] py-2 pr-3">Panel baseline</th>
                  <th className="border-b border-[var(--color-line)] py-2 pr-3">Lift</th>
                  <th className="border-b border-[var(--color-line)] py-2 pr-3">Score</th>
                  <th className="border-b border-[var(--color-line)] py-2 pr-3">Note</th>
                </tr>
              </thead>
              <tbody>
                {plan.cityBoard.map((row) => (
                  <tr key={`${row.name}-${row.region}`}>
                    <td className="border-b border-[var(--color-line)] py-2 pr-3">
                      {row.name}, {row.region}
                    </td>
                    <td className="border-b border-[var(--color-line)] py-2 pr-3 font-mono">
                      {formatAffinity(row.affinity)}
                    </td>
                    <td className="border-b border-[var(--color-line)] py-2 pr-3 font-mono">
                      {typeof row.baseline === "number" ? formatAffinity(row.baseline) : "n/a"}
                    </td>
                    <td className="border-b border-[var(--color-line)] py-2 pr-3 font-mono">
                      {typeof row.lift === "number"
                        ? `${row.lift >= 0 ? "+" : ""}${formatAffinity(row.lift)}`
                        : "n/a"}
                    </td>
                    <td className="border-b border-[var(--color-line)] py-2 pr-3 font-mono">
                      {formatAffinity(row.score)}
                    </td>
                    <td className="border-b border-[var(--color-line)] py-2 pr-3 text-[var(--color-muted)]">
                      {row.note}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="px-5 py-8 md:px-8">
        <div className="mb-4 flex items-end justify-between">
          <h2 className="display text-3xl">Itinerary</h2>
          {routeView === "without" && withoutQloo ? (
            <p className="ticket-kicker text-[var(--color-muted)]">
              {formatMiles(withoutQloo.totalMiles)} · biggest metros
            </p>
          ) : plan?.route ? (
            <p className="ticket-kicker text-[var(--color-muted)]">
              {formatMiles(plan.route.totalMiles)} · {formatHours(plan.route.totalDriveHours)} ·{" "}
              {plan.route.nights} nights
            </p>
          ) : (
            <p className="text-sm text-[var(--color-muted)]">
              {live ? "Cities land as heatmaps return." : "No dates on this sheet."}
            </p>
          )}
        </div>
        {routeView === "without" && withoutQloo ? (
          <div className="overflow-x-auto">
            <p className="mb-3 max-w-3xl text-sm text-[var(--color-muted)]">{withoutQloo.method}</p>
            <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
              <thead className="ticket-kicker text-[var(--color-muted)]">
                <tr>
                  <th className="w-14 border-b border-[var(--color-line)] py-2 pr-3">Stop</th>
                  <th className="border-b border-[var(--color-line)] py-2 pr-3">City</th>
                  <th className="border-b border-[var(--color-line)] py-2 pr-3">Metro (millions)</th>
                  <th className="border-b border-[var(--color-line)] py-2 pr-3">Qloo run</th>
                </tr>
              </thead>
              <tbody>
                {withoutQloo.cities.map((city, index) => {
                  const key = `${city.name}, ${city.region}`;
                  const onQloo = sharedSet.has(cityId(city));
                  return (
                    <tr key={key}>
                      <td className="border-b border-[var(--color-line)] py-3 pr-3">
                        <span className="highway-shield mx-auto">{String(index + 1).padStart(2, "0")}</span>
                      </td>
                      <td className="border-b border-[var(--color-line)] py-3 pr-3">{key}</td>
                      <td className="border-b border-[var(--color-line)] py-3 pr-3 font-mono">
                        {city.metroMillions.toFixed(1)}
                      </td>
                      <td className="border-b border-[var(--color-line)] py-2 pr-3 text-[var(--color-muted)]">
                        {onQloo ? "also on the Qloo run" : "Qloo cut this stop"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {qlooOnlyStops.length > 0 ? (
              <p className="mt-4 max-w-3xl text-sm text-[var(--color-muted)]">
                Stops only taste data picks:{" "}
                {qlooOnlyStops
                  .map((stop) => {
                    const row = boardById.get(cityId(stop.city));
                    const lift =
                      typeof row?.lift === "number"
                        ? ` (${row.lift >= 0 ? "+" : ""}${formatAffinity(row.lift)} lift)`
                        : "";
                    return `${cityId(stop.city)}${lift}`;
                  })
                  .join(" · ")}
              </p>
            ) : null}
          </div>
        ) : stops.length === 0 ? (
          <p className="border border-dashed border-[var(--color-line)] px-4 py-8 text-[var(--color-muted)]">
            Empty run. Stamp a coupon on the issue if this link has no dates.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] table-fixed border-collapse text-left text-sm">
              <thead className="ticket-kicker text-[var(--color-muted)]">
                <tr>
                  <th className="w-14 border-b border-[var(--color-line)] py-2 pr-3">Stop</th>
                  <th className="w-[7.5rem] border-b border-[var(--color-line)] py-2 pr-3">Date</th>
                  <th className="w-[9rem] border-b border-[var(--color-line)] py-2 pr-3">City</th>
                  <th className="w-[11rem] border-b border-[var(--color-line)] py-2 pr-3">Venue</th>
                  <th className="w-[12rem] border-b border-[var(--color-line)] py-2 pr-3">Openers</th>
                  <th className="border-b border-[var(--color-line)] py-2 pr-3">Why</th>
                </tr>
              </thead>
              <tbody>
                {stops.map((stop) => (
                  <tr
                    key={`${stop.order}-${stop.city.name}`}
                    id={`stop-${stop.order}`}
                    className={openStop?.order === stop.order ? "itinerary-row is-selected" : "itinerary-row"}
                  >
                    <td className="border-b border-[var(--color-line)] py-3 pr-3">
                      <span className="highway-shield mx-auto">{String(stop.order).padStart(2, "0")}</span>
                    </td>
                    <td className="border-b border-[var(--color-line)] py-3 pr-3 font-mono text-sm">
                      {stop.date}
                      {stop.dateNote ? (
                        <span className="block text-[var(--color-warning)]">{stop.dateNote}</span>
                      ) : null}
                      {stop.order > 1 ? (
                        <span className="block text-[var(--color-muted)]">
                          {formatHours(stop.driveHoursFromPrev)} / {formatMiles(stop.milesFromPrev)}
                        </span>
                      ) : (
                        <span className="block text-[var(--color-muted)]">open</span>
                      )}
                    </td>
                    <td className="border-b border-[var(--color-line)] py-3 pr-3">
                      {stop.city.name}, {stop.city.region}
                      <span className="block text-sm text-[var(--color-muted)]">
                        affinity {formatAffinity(stop.affinity)}
                      </span>
                    </td>
                    <td className="border-b border-[var(--color-line)] py-3 pr-3 break-words">
                      {stop.venue.name === "Hold" ? (
                        <span className="text-[var(--color-warning)]">Hold: no room yet</span>
                      ) : (
                        stop.venue.name
                      )}
                    </td>
                    <td className="border-b border-[var(--color-line)] py-3 pr-3 break-words">
                      {stop.openers.map((opener) => opener.name).join(" · ") || "Hold"}
                    </td>
                    <td className="border-b border-[var(--color-line)] py-3 pr-3 align-top break-words">
                      <button
                        type="button"
                        className="itinerary-why w-full whitespace-normal text-left leading-snug text-[var(--color-accent)] underline decoration-dotted"
                        onClick={() => selectStop(stop)}
                      >
                        {stop.venue.why}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {openStop ? <StopBrief stop={openStop} calls={receipts?.calls} onClose={() => setOpenStop(null)} /> : null}

      {receiptsOpen && receipts ? (
        <div
          className="fixed inset-0 z-50 bg-[var(--color-overlay)]"
          role="dialog"
          aria-modal="true"
          aria-label="Qloo call receipts"
        >
          <aside className="paper absolute inset-y-0 right-0 flex w-full max-w-3xl flex-col overflow-hidden">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--color-line)] p-4">
              <div>
                <h2 className="display text-3xl text-[var(--color-ink)]">
                  {receipts.totals.calls} Qloo calls · {(receipts.totals.ms / 1000).toFixed(1)} s ·{" "}
                  {receipts.invented} invented
                </h2>
                <p className="mt-1 text-sm text-[var(--color-muted)]">
                  Every call behind this plan. Requests were sent with X-Api-Key: [redacted].{" "}
                  {receipts.totals.live} live · {receipts.totals.cache} cache · {receipts.totals.shared}{" "}
                  shared · {receipts.totals.mock} mock · {receipts.totals.errors} errors ·{" "}
                  {receipts.checkedEntities} entities checked
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReceiptsOpen(false)}
                className="btn btn-ghost text-[var(--color-ink)]"
              >
                Close
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="ticket-kicker text-[var(--color-muted)]">
                  <tr>
                    <th className="border-b border-[var(--color-line)] py-2 pr-2">#</th>
                    <th className="border-b border-[var(--color-line)] py-2 pr-2">Purpose</th>
                    <th className="border-b border-[var(--color-line)] py-2 pr-2">Call</th>
                    <th className="border-b border-[var(--color-line)] py-2 pr-2">Source</th>
                    <th className="border-b border-[var(--color-line)] py-2 pr-2">ms</th>
                    <th className="border-b border-[var(--color-line)] py-2 pr-2">Results</th>
                    <th className="border-b border-[var(--color-line)] py-2 pr-2">Entity IDs</th>
                  </tr>
                </thead>
                <tbody>
                  {receipts.calls.map((call) => (
                    <tr key={call.n} className="align-top">
                      <td className="border-b border-[var(--color-line)] py-2 pr-2 font-mono">{call.n}</td>
                      <td className="border-b border-[var(--color-line)] py-2 pr-2">{call.purpose}</td>
                      <td className="border-b border-[var(--color-line)] py-2 pr-2 font-mono text-xs">
                        {call.path}
                        {Object.keys(call.params).length ? (
                          <span className="block break-all text-[var(--color-muted)]">
                            {Object.entries(call.params)
                              .map(([key, value]) => `${key}=${value}`)
                              .join("&")}
                          </span>
                        ) : null}
                      </td>
                      <td className="border-b border-[var(--color-line)] py-2 pr-2">
                        {call.source}
                        {call.httpStatus ? ` ${call.httpStatus}` : ""}
                      </td>
                      <td className="border-b border-[var(--color-line)] py-2 pr-2 font-mono">{call.ms}</td>
                      <td className="border-b border-[var(--color-line)] py-2 pr-2 font-mono">
                        {call.resultCount}
                      </td>
                      <td className="border-b border-[var(--color-line)] py-2 pr-2 font-mono text-xs break-all">
                        {call.entityIds.slice(0, 4).join(", ")}
                        {call.entityIds.length > 4 ? ` +${call.entityIds.length - 4}` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
