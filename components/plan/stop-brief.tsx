import type { RoutedStop } from "@/lib/types";
import { formatAffinity } from "@/lib/utils";

export function StopBrief({ stop, onClose }: { stop: RoutedStop; onClose: () => void }) {
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
          <button type="button" onClick={onClose} className="btn btn-ghost text-[var(--color-ink)]">
            Close
          </button>
        </div>
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
                      {opener.name}, overlap {formatAffinity(opener.overlap)}. {opener.why}
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
      </div>
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
