"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { APP_NAME } from "@/lib/config";
import {
  computeDeal,
  defaultAssumptions,
  holdRequestEmail,
  radiusClauseWarnings,
  type DealAssumptions,
} from "@/lib/settlement/deal";
import type { RoutedStop, TourPlan } from "@/lib/types";
import { formatMiles } from "@/lib/utils";

const money = (n: number) => `$${n.toLocaleString("en-US")}`;

export function PacketView({ plan }: { plan: TourPlan | null }) {
  const stops = useMemo(() => plan?.route?.stops ?? [], [plan]);
  const radius = useMemo(() => radiusClauseWarnings(stops), [stops]);
  const [overrides, setOverrides] = useState<Record<number, Partial<DealAssumptions>>>({});

  if (!plan) {
    return (
      <div className="desk-stage min-h-full p-8">
        <p className="fail-sheet text-sm">No packet on this plate. Check the plan link.</p>
      </div>
    );
  }
  const act = plan.act;
  const assumptionsFor = (stop: RoutedStop): DealAssumptions => ({
    ...(act ? defaultAssumptions(stop, act) : ({} as DealAssumptions)),
    ...overrides[stop.order],
  });

  const totals = stops.reduce(
    (acc, stop) => {
      if (!act) {
        return acc;
      }
      const deal = computeDeal(stop, assumptionsFor(stop));
      acc.gross += deal.projectedGross;
      acc.offer += deal.offer;
      return acc;
    },
    { gross: 0, offer: 0 },
  );

  return (
    <div className="desk-stage min-h-full">
      <header className="border-b border-[var(--color-line)] px-5 py-5 md:px-8">
        <Link href={`/plan/${plan.id}`} className="desk-link ticket-kicker">
          Back to the sheet
        </Link>
        <h1 className="display mt-1 text-4xl md:text-6xl">Advance packet: {act?.name}</h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--color-muted)]">
          Dates, hold requests, and the settlement sheet. Taste inputs (room size tag, price level,
          act popularity) come from Qloo. Every other number below is a labeled assumption you can
          edit; nothing is sent or booked.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <a className="desk-link" href={`/api/plans/${plan.id}/csv`}>CSV</a>
          <span className="text-[var(--color-muted)]">·</span>
          <a className="desk-link" href={`/api/plans/${plan.id}/receipt`}>Receipt JSON</a>
          <span className="text-[var(--color-muted)]">·</span>
          <Link className="desk-link" href={`/plan/${plan.id}`}>Plan page</Link>
        </div>
      </header>

      <section className="px-5 py-6 md:px-8">
        <h2 className="display text-3xl">Settlement sheet</h2>
        <p className="mt-1 max-w-3xl text-sm text-[var(--color-muted)]">
          Projected gross = capacity x sell-through x ticket price. The offer column is
          max(guarantee, versus % of net). Editable cells are assumptions; room size and price level
          are Qloo inputs.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[60rem] border-collapse text-left text-sm">
            <thead className="ticket-kicker text-[var(--color-muted)]">
              <tr>
                <th className="border-b border-[var(--color-line)] py-2 pr-3">Date</th>
                <th className="border-b border-[var(--color-line)] py-2 pr-3">City</th>
                <th className="border-b border-[var(--color-line)] py-2 pr-3">Room</th>
                <th className="border-b border-[var(--color-line)] py-2 pr-3">Cap (edit)</th>
                <th className="border-b border-[var(--color-line)] py-2 pr-3">Sell-thru (edit)</th>
                <th className="border-b border-[var(--color-line)] py-2 pr-3">Ticket (edit)</th>
                <th className="border-b border-[var(--color-line)] py-2 pr-3">Gross</th>
                <th className="border-b border-[var(--color-line)] py-2 pr-3">Guarantee (edit)</th>
                <th className="border-b border-[var(--color-line)] py-2 pr-3">Versus (edit)</th>
                <th className="border-b border-[var(--color-line)] py-2 pr-3">Offer</th>
                <th className="border-b border-[var(--color-line)] py-2 pr-3">Warnings</th>
              </tr>
            </thead>
            <tbody>
              {stops.map((stop) => {
                if (!act) {
                  return null;
                }
                const a = assumptionsFor(stop);
                const deal = computeDeal(stop, a);
                const radiusWarnings = radius.get(stop.order) ?? [];
                const set = (patch: Partial<DealAssumptions>) =>
                  setOverrides((prev) => ({ ...prev, [stop.order]: { ...prev[stop.order], ...patch } }));
                return (
                  <tr key={stop.order} className="align-top">
                    <td className="border-b border-[var(--color-line)] py-2 pr-3 font-mono">{stop.date}</td>
                    <td className="border-b border-[var(--color-line)] py-2 pr-3">
                      {stop.city.name}, {stop.city.region}
                    </td>
                    <td className="border-b border-[var(--color-line)] py-2 pr-3">
                      {stop.venue.name}
                      <span className="block text-xs text-[var(--color-muted)]">
                        {stop.venue.size ?? "unknown"} room · Qloo tags
                        {typeof stop.venue.priceLevel === "number" ? ` · price level ${stop.venue.priceLevel}/4` : ""}
                      </span>
                    </td>
                    <td className="border-b border-[var(--color-line)] py-2 pr-3">
                      <input
                        aria-label={`capacity ${stop.city.name}`}
                        className="w-20 border border-[var(--color-line)] bg-transparent px-1 font-mono"
                        type="number"
                        value={a.capacity}
                        onChange={(e) => set({ capacity: Number(e.target.value) })}
                      />
                    </td>
                    <td className="border-b border-[var(--color-line)] py-2 pr-3">
                      <input
                        aria-label={`sell through ${stop.city.name}`}
                        className="w-16 border border-[var(--color-line)] bg-transparent px-1 font-mono"
                        type="number"
                        step="0.05"
                        min="0"
                        max="1"
                        value={a.sellThrough}
                        onChange={(e) => set({ sellThrough: Number(e.target.value) })}
                      />
                    </td>
                    <td className="border-b border-[var(--color-line)] py-2 pr-3">
                      <input
                        aria-label={`ticket price ${stop.city.name}`}
                        className="w-16 border border-[var(--color-line)] bg-transparent px-1 font-mono"
                        type="number"
                        step="5"
                        value={a.ticketPrice}
                        onChange={(e) => set({ ticketPrice: Number(e.target.value) })}
                      />
                    </td>
                    <td className="border-b border-[var(--color-line)] py-2 pr-3 font-mono">
                      {money(deal.projectedGross)}
                    </td>
                    <td className="border-b border-[var(--color-line)] py-2 pr-3">
                      <input
                        aria-label={`guarantee ${stop.city.name}`}
                        className="w-24 border border-[var(--color-line)] bg-transparent px-1 font-mono"
                        type="number"
                        step="100"
                        value={a.guarantee}
                        onChange={(e) => set({ guarantee: Number(e.target.value) })}
                      />
                    </td>
                    <td className="border-b border-[var(--color-line)] py-2 pr-3">
                      <input
                        aria-label={`versus pct ${stop.city.name}`}
                        className="w-16 border border-[var(--color-line)] bg-transparent px-1 font-mono"
                        type="number"
                        step="0.05"
                        min="0"
                        max="1"
                        value={a.versusPct}
                        onChange={(e) => set({ versusPct: Number(e.target.value) })}
                      />
                      <span className="block text-xs text-[var(--color-muted)]">
                        = {money(deal.versusAmount)} of net
                      </span>
                    </td>
                    <td className="border-b border-[var(--color-line)] py-2 pr-3 font-mono">
                      {money(deal.offer)}
                    </td>
                    <td className="border-b border-[var(--color-line)] py-2 pr-3 text-xs text-[var(--color-warning)]">
                      {[...deal.warnings, ...radiusWarnings.map((c) => `radius clause: also playing ${c}`)].join("; ")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className="py-3 pr-3 ticket-kicker" colSpan={6}>
                  Run totals
                </td>
                <td className="py-3 pr-3 font-mono">{money(totals.gross)}</td>
                <td className="py-3 pr-3" colSpan={2}></td>
                <td className="py-3 pr-3 font-mono">{money(totals.offer)}</td>
                <td className="py-3 pr-3 text-xs text-[var(--color-muted)]">
                  {formatMiles(plan.route?.totalMiles ?? 0)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="border-t border-[var(--color-line)] px-5 py-6 md:px-8">
        <h2 className="display text-3xl">Hold requests</h2>
        <p className="mt-1 max-w-3xl text-sm text-[var(--color-muted)]">
          Text-only drafts per room. Nothing is sent from {APP_NAME}; copy what you need.
        </p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {stops.map((stop) => (
            <div key={stop.order} className="border border-[var(--color-line)] p-4">
              <p className="ticket-kicker text-[var(--color-muted)]">
                {stop.date} · {stop.city.name}, {stop.city.region} · {stop.venue.name}
              </p>
              <pre className="mt-2 whitespace-pre-wrap font-mono text-sm">
                {act ? holdRequestEmail(stop, act) : ""}
              </pre>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
