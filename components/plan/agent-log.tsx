import type { AgentStep } from "@/lib/types";

function deskStep(step: AgentStep): AgentStep {
  if (/Writer:|writer fallback|Mode mock|Qloo calls/i.test(step.detail)) {
    return { ...step, detail: "The last call is in. The plate is ready to tear." };
  }
  return step;
}

export function AgentLog({ steps, live = false }: { steps: AgentStep[]; live?: boolean }) {
  if (steps.length === 0) {
    return (
      <div className="border border-dashed border-[var(--color-line)] px-4 py-6 text-sm text-[var(--color-muted)]">
        {live ? "Desk radio is open. Waiting for the first Qloo call." : "No dispatch log on this sheet."}
      </div>
    );
  }

  return (
    <ol className="grid gap-0 border border-[var(--color-line)]">
      {steps.map((raw, index) => {
        const step = deskStep(raw);
        return (
          <li
            key={step.id}
            tabIndex={0}
            className={`log-row grid grid-cols-[auto_1fr] gap-3 border-b border-[var(--color-line)] px-3 py-3 last:border-b-0 ${
              step.status === "running" ? "is-loading" : ""
            }`}
          >
            <span className="ticket-kicker text-[var(--color-accent)]">{String(index + 1).padStart(2, "0")}</span>
            <div>
              <p className="text-sm text-[var(--color-text)]">{step.title}</p>
              <p className="text-sm text-[var(--color-muted)]">{step.detail}</p>
              {step.endpoint ? (
                <p className="ticket-kicker mt-1 text-[var(--color-focus)]">{step.endpoint}</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
