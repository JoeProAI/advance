import { createHash } from "node:crypto";
import { PLAN_RATE_LIMIT_PER_HOUR } from "@/lib/config";
import { getPlanStore, type PlanStore } from "@/lib/storage";

const HOUR = 60 * 60 * 1000;

/** IPs are hashed before they reach the store. */
export function rateLimitKey(ip: string, salt = process.env.ADVANCE_STORE_SECRET ?? "advance-local"): string {
  return `plans:${createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32)}`;
}

export async function checkPlanRateLimit(
  ip: string,
  store: PlanStore = getPlanStore(),
): Promise<{ ok: boolean; retryAfterSec: number }> {
  try {
    return await store.rateLimit(rateLimitKey(ip), PLAN_RATE_LIMIT_PER_HOUR, HOUR);
  } catch {
    // Store down: let the request through rather than block every visitor.
    return { ok: true, retryAfterSec: 0 };
  }
}

export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]!.trim();
  }
  return headers.get("x-real-ip") ?? "local";
}
