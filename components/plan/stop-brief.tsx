import { useState } from "react";

import type { QlooCallReceipt } from "@/lib/qloo/trace";
import type { RoutedStop } from "@/lib/types";
import { formatAffinity } from "@/lib/utils";

export function StopBrief({
  stop,
  calls,
  onClose,
}: {
  stop: RoutedStop;
  calls?: QlooCallReceipt[];
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"brief" | "receipts">("brief");
  const receipt = stop.receipt;
  const stopCalls = (receipt?.callNs ?? [])
    .map((n) => calls?.find((call) => call.n === n))
    .filter((call): call is QlooCallReceipt => Boolean(call));
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-end bg-[var(--color-overlay)] p-0 md:place-items-center md:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="brief-title"
    >
      <div className="paper max-h-[92vh] w-full overflow-auto p-6 md:max-w-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="ticket-kicker text-[var(--color-ink)]">
              Stop {String(stop.order).padStart(2, "0")} · {stop.date}
            </p>
            <h2 id="brief-title" className="display mt-1 text-4xl text-[var(--color-ink)]">
              {stop.city.name}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {receipt ? (
              <div className="flex gap-1" role="tablist" aria-label="Stop detail">
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === "brief"}
                  onClick={() => setTab("brief")}
                  className={`btn btn-ghost text-[var(--color-ink)] ${tab === "brief" ? "underline" : ""}`}
                >
                  Brief
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === "receipts"}
                  onClick={() => setTab("receipts")}
                  className={`btn btn-ghost text-[var(--color-ink)] ${tab === "receipts" ? "underline" : ""}`}
                >
                  Receipts
                </button>
              </div>
            ) : null}
            <button type="button" onClick={onClose} className="btn btn-ghost text-[var(--color-ink)]">
              Close
            </button>
          </div>
        </div>
        {tab === "receipts" && receipt ? (
          <Receipts stop={stop} calls={stopCalls} />
        ) : (
          <>
        <p className="mt-4 text-sm text-[var(--color-ink)]">{stop.brief.audience}</p>
        <dl className="mt-5 grid gap-3 text-sm">
          <div>
            <dt className="ticket-kicker text-[var(--color-ink)]">Room</dt>
            <dd>
              {stop.venue.name} · affinity {formatAffinity(stop.venue.affinity)}
              <span className="mt-1 block text-[var(--color-ink)]">{stop.venue.why}</span>
              <span className="block text-sm">{stop.venue.estimatedRoom}</span>
            </dd>
          </div>
          <div>
            <dt className="ticket-kicker text-[var(--color-ink)]">Openers</dt>
            <dd>
              {stop.openers.length === 0
                ? "No local openers returned."
                : stop.openers.map((opener) => (
                    <p key={opener.entityId}>
                      {opener.name},{" "}
                      {typeof opener.sharedTagCount === "number"
                        ? `${opener.sharedTagCount} shared tags${
                            opener.sharedTags?.length
                              ? ` (${opener.sharedTags
                                  .slice(0, 3)
                                  .map((tag) => `${tag.name} ${formatAffinity(tag.score)}`)
                                  .join(", ")})`
                              : ""
                          }`
                        : `affinity ${formatAffinity(opener.affinity)}`}
                      . {opener.why}
                    </p>
                  ))}
            </dd>
          </div>
        </dl>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <List title="Podcasts" items={stop.brief.podcasts} />
          <List title="Bars" items={stop.brief.bars} />
          <List title="Brands" items={stop.brief.brands} />
        </div>
        <blockquote className="mt-6 border-l-2 border-[var(--color-accent-2)] pl-3 text-sm italic text-[var(--color-ink)]">
          {stop.brief.socialPost}
        </blockquote>
          </>
        )}
      </div>
    </div>
  );
}

function Receipts({ stop, calls }: { stop: RoutedStop; calls: QlooCallReceipt[] }) {
  const heat = stop.receipt!.heat;
  const rows: Array<[string, string | undefined]> = [
    ["Heatmap cell", heat.geohash],
    ["Cell affinity", typeof heat.cellAffinity === "number" ? formatAffinity(heat.cellAffinity) : undefined],
    ["Cell popularity", typeof heat.cellPopularity === "number" ? formatAffinity(heat.cellPopularity) : undefined],
    ["Affinity rank", `#${heat.affinityRank}`],
    ["City score", formatAffinity(heat.cityScore)],
    ["Panel baseline", typeof heat.baseline === "number" ? formatAffinity(heat.baseline) : undefined],
    [
      "Lift",
      typeof heat.lift === "number" ? `${heat.lift >= 0 ? "+" : ""}${formatAffinity(heat.lift)}` : undefined,
    ],
    ["Route score", typeof heat.routeScore === "number" ? formatAffinity(heat.routeScore) : undefined],
    [
      "Venue",
      `${stop.venue.name} · ${stop.venue.entityId}${
        typeof stop.venue.affinity === "number" ? ` · affinity ${formatAffinity(stop.venue.affinity)}` : ""
      }`,
    ],
    [
      "Venue tags",
      stop.venue.tags.length ? stop.venue.tags.join(", ") : "none",
    ],
    [
      "Openers",
      stop.openers.length
        ? stop.openers
            .map(
              (opener) =>
                `${opener.name} ${opener.entityId} pop ${formatAffinity(opener.popularity)}${
                  typeof opener.sharedTagCount === "number" ? ` · ${opener.sharedTagCount} shared tags` : ""
                }`,
            )
            .join(" | ")
        : "none",
    ],
  ];
  return (
    <div role="tabpanel" className="mt-4">
      <dl className="grid gap-2 text-sm">
        {rows.map(([label, value]) =>
          value === undefined ? null : (
            <div key={label} className="flex justify-between gap-4">
              <dt className="ticket-kicker text-[var(--color-ink)]">{label}</dt>
              <dd className="text-right font-mono text-[var(--color-ink)]">{value}</dd>
            </div>
          ),
        )}
      </dl>
      <p className="ticket-kicker mt-5 text-[var(--color-ink)]">Calls behind this stop</p>
      {calls.length === 0 ? (
        <p className="text-sm text-[var(--color-ink)]">No calls recorded for this stop.</p>
      ) : (
        <ul className="mt-2 grid gap-2">
          {calls.map((call) => (
            <li key={call.n} className="text-sm text-[var(--color-ink)]">
              <span className="font-mono">
                #{call.n} {call.path}
              </span>{" "}
              · {call.source} · {call.ms} ms · {call.resultCount} results
              <span className="block break-all font-mono text-xs text-[var(--color-muted)]">
                {Object.entries(call.params)
                  .map(([key, value]) => `${key}=${value}`)
                  .join("&")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function List({ title, items }: { title: string; items: Array<{ name: string; why: string }> }) {
  return (
    <div>
      <p className="ticket-kicker text-[var(--color-ink)]">{title}</p>
      {items.length === 0 ? (
        <p className="text-sm text-[var(--color-ink)]">Thin here.</p>
      ) : (
        <ul className="mt-1 grid gap-2">
          {items.map((item) => (
            <li key={item.name}>
              <p className="text-sm font-medium text-[var(--color-ink)]">{item.name}</p>
              <p className="text-sm text-[var(--color-ink)]">{item.why}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
