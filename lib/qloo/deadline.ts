import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Time budget for one plan run. Every Qloo call reads the remaining time so
 * its timeout and retries can never push the run past the route limit.
 */
const store = new AsyncLocalStorage<{ deadline: number }>();

/** Per-call ceiling even when plenty of run time is left. */
export const QLOO_CALL_TIMEOUT_MS = 15_000;
/** Below this much time left, calls fail fast instead of starting. */
export const QLOO_MIN_CALL_MS = 1_500;

export function withDeadline<T>(budgetMs: number, fn: () => Promise<T>): Promise<T> {
  return store.run({ deadline: Date.now() + budgetMs }, fn);
}

export function remainingMs(): number {
  const current = store.getStore();
  return current ? current.deadline - Date.now() : Number.POSITIVE_INFINITY;
}

export function callTimeoutMs(): number {
  return Math.max(0, Math.min(QLOO_CALL_TIMEOUT_MS, remainingMs() - 1_000));
}

export class QlooDeadlineError extends Error {
  constructor(path: string) {
    super(`Skipped ${path}: the plan ran out of time.`);
    this.name = "QlooDeadlineError";
  }
}

/** Small counting semaphore so parallel stops do not burst the host. */
export function createLimiter(max: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  return async function limit<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= max) {
      await new Promise<void>((resolve) => queue.push(resolve));
    }
    active += 1;
    try {
      return await fn();
    } finally {
      active -= 1;
      queue.shift()?.();
    }
  };
}
