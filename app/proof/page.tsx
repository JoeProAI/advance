import { readFile } from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import { APP_NAME } from "@/lib/config";

export const dynamic = "force-dynamic";

type ActResult = {
  act: string;
  tour: string;
  source: string;
  realCities: number;
  k: number;
  liftHits: number;
  metroHits: number;
  combinedHits: number;
  liftRecall: number;
  metroRecall: number;
  combinedRecall: number;
};

type SkippedAct = { act: string; reason: string };

type BacktestResults = {
  generatedAt: string;
  method: string;
  combinedWeight?: number;
  acts: number;
  meanLiftRecall: number;
  meanMetroRecall: number;
  meanCombinedRecall?: number;
  totalLiftHits: number;
  totalMetroHits: number;
  totalCombinedHits?: number;
  totalCities: number;
  wins: { lift: number; metros: number; combined?: number; ties: number };
  perAct: ActResult[];
  skipped?: SkippedAct[];
};

async function loadResults(): Promise<BacktestResults | null> {
  try {
    const raw = await readFile(path.join(process.cwd(), "data/backtest/results.json"), "utf8");
    return JSON.parse(raw) as BacktestResults;
  } catch {
    return null;
  }
}

export default async function ProofPage() {
  const results = await loadResults();
  const combinedWeight = results?.combinedWeight ?? 0.5;
  const skipped = results?.skipped ?? [];
  return (
    <div className="desk-stage min-h-full">
      <header className="border-b border-[var(--color-line)] px-5 py-5 md:px-8">
        <Link href="/" className="desk-link ticket-kicker">
          {APP_NAME} issue
        </Link>
        <h1 className="display mt-1 text-4xl md:text-6xl">Proof it routes like a booker</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--color-muted)]">
          Backtest against real announced 2025-26 tour routing. Does the taste graph pick the same
          cities bookers actually route?
        </p>
      </header>

      {!results ? (
        <p className="fail-sheet mx-5 mt-4 text-sm md:mx-8">
          No backtest results committed yet. Run{" "}
          <code className="font-mono">QLOO_MODE=live npx tsx scripts/backtest.ts</code>.
        </p>
      ) : (
        <>
          <section className="grid gap-4 px-5 py-6 md:grid-cols-4 md:px-8">
            <div className="border border-[var(--color-line)] p-4">
              <p className="ticket-kicker text-[var(--color-muted)]">Qloo lift ranking</p>
              <p className="display mt-1 text-4xl">{(results.meanLiftRecall * 100).toFixed(1)}%</p>
              <p className="text-sm text-[var(--color-muted)]">
                mean hit rate at K · {results.totalLiftHits} of {results.totalCities} cities
              </p>
            </div>
            <div className="border border-[var(--color-line)] p-4">
              <p className="ticket-kicker text-[var(--color-muted)]">Biggest metros baseline</p>
              <p className="display mt-1 text-4xl">{(results.meanMetroRecall * 100).toFixed(1)}%</p>
              <p className="text-sm text-[var(--color-muted)]">
                mean hit rate at K · {results.totalMetroHits} of {results.totalCities} cities
              </p>
            </div>
            <div className="border border-[var(--color-line)] p-4">
              <p className="ticket-kicker text-[var(--color-muted)]">
                Combined: {(combinedWeight * 100).toFixed(0)}% metros +{" "}
                {((1 - combinedWeight) * 100).toFixed(0)}% lift
              </p>
              <p className="display mt-1 text-4xl">
                {typeof results.meanCombinedRecall === "number"
                  ? `${(results.meanCombinedRecall * 100).toFixed(1)}%`
                  : "—"}
              </p>
              <p className="text-sm text-[var(--color-muted)]">
                second method, added after the first result · weight declared up front, not tuned
              </p>
            </div>
            <div className="border border-[var(--color-line)] p-4">
              <p className="ticket-kicker text-[var(--color-muted)]">Head to head</p>
              <p className="display mt-1 text-4xl">
                {results.wins.lift}-{results.wins.metros}-{results.wins.combined ?? 0}-
                {results.wins.ties}
              </p>
              <p className="text-sm text-[var(--color-muted)]">
                outright winners (lift / metros / combined / ties) across {results.acts} tours
              </p>
            </div>
          </section>

          <section className="px-5 pb-8 md:px-8">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[48rem] border-collapse text-left text-sm">
                <thead className="ticket-kicker text-[var(--color-muted)]">
                  <tr>
                    <th className="border-b border-[var(--color-line)] py-2 pr-3">Act</th>
                    <th className="border-b border-[var(--color-line)] py-2 pr-3">Tour</th>
                    <th className="border-b border-[var(--color-line)] py-2 pr-3">K</th>
                    <th className="border-b border-[var(--color-line)] py-2 pr-3">Lift hits</th>
                    <th className="border-b border-[var(--color-line)] py-2 pr-3">Metro hits</th>
                    <th className="border-b border-[var(--color-line)] py-2 pr-3">Combined hits</th>
                    <th className="border-b border-[var(--color-line)] py-2 pr-3">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {results.perAct.map((row) => (
                    <tr key={`${row.act}-${row.tour}`}>
                      <td className="border-b border-[var(--color-line)] py-2 pr-3">{row.act}</td>
                      <td className="border-b border-[var(--color-line)] py-2 pr-3 text-[var(--color-muted)]">
                        {row.tour}
                      </td>
                      <td className="border-b border-[var(--color-line)] py-2 pr-3 font-mono">{row.k}</td>
                      <td className="border-b border-[var(--color-line)] py-2 pr-3 font-mono">
                        {row.liftHits} ({(row.liftRecall * 100).toFixed(0)}%)
                      </td>
                      <td className="border-b border-[var(--color-line)] py-2 pr-3 font-mono">
                        {row.metroHits} ({(row.metroRecall * 100).toFixed(0)}%)
                      </td>
                      <td className="border-b border-[var(--color-line)] py-2 pr-3 font-mono">
                        {row.combinedHits} ({(row.combinedRecall * 100).toFixed(0)}%)
                      </td>
                      <td className="border-b border-[var(--color-line)] py-2 pr-3">
                        <a className="desk-link" href={row.source} target="_blank" rel="noreferrer">
                          source
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {skipped.length > 0 && (
              <div className="mt-6 max-w-3xl text-sm">
                <p className="ticket-kicker mb-2 text-[var(--color-muted)]">
                  Skipped acts ({skipped.length})
                </p>
                <ul className="list-disc pl-5 text-[var(--color-muted)]">
                  {skipped.map((row) => (
                    <li key={row.act}>
                      {row.act}: {row.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-6 max-w-3xl text-sm text-[var(--color-muted)]">
              <p className="ticket-kicker mb-2">Method and caveats</p>
              <p>{results.method}</p>
              <ul className="mt-2 list-disc pl-5">
                <li>
                  Where they played is not pure taste. Bookers route where rooms, offers, and
                  drive legs exist, and those cluster in big metros. A biggest-metros list is a
                  strong baseline because real routing is conservative, not because taste does not
                  matter.
                </li>
                <li>
                  The combined method was added after the first lift-vs-metros result. Its 50/50
                  weight was declared up front and was not tuned on these tours.
                </li>
                <li>
                  An LLM-only baseline is left out on purpose: running it costs money, and this
                  project does not spend on paid models.
                </li>
                <li>Small N: {results.acts} tours{skipped.length > 0 ? `, ${skipped.length} skipped` : ""}.</li>
                <li>Only 36 markets are scored; real tours hit smaller rooms this product cannot name.</li>
                <li>Real tour cities were mapped to the nearest of the 36 markets before scoring.</li>
                <li>Generated {new Date(results.generatedAt).toUTCString()} ·{" "}
                  <a className="desk-link" href="https://github.com/JoeProAI/advance/tree/main/data/backtest">
                    data and methodology
                  </a>
                </li>
              </ul>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
