import Link from "next/link";
import { RouteAtlas } from "@/components/plan/route-atlas";
import type { DeskFailureCopy } from "@/lib/desk-states";

export function DeskFailure({ copy }: { copy: DeskFailureCopy }) {
  return (
    <main className="desk-stage desk-fail-stage">
      <div className="desk-fail-atlas" aria-hidden>
        <RouteAtlas stops={[]} showBase />
      </div>
      <p className="ticket-kicker relative z-[1] text-[var(--color-accent)]">Proof desk · recovery</p>
      <article className="ticket-notch paper relative z-[1] mt-6 w-full max-w-xl p-6" data-state={copy.state}>
        <span className="absolute -top-3 right-4 rotate-2 border border-[var(--color-accent-2)] px-2 py-1 font-mono text-[length:var(--text-xs)] uppercase tracking-[var(--letter-ticket)] text-[var(--color-accent-2)]">
          {copy.stamp}
        </span>
        <h1 className="display mt-4 text-4xl text-[var(--color-ink)] md:text-6xl">{copy.title}</h1>
        <p className="mt-4 max-w-xl text-[var(--color-ink)]">{copy.body}</p>
        <Link href={copy.recovery.href} className="btn btn-stamp mt-6">
          {copy.recovery.label}
        </Link>
      </article>
    </main>
  );
}
