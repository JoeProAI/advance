import { PLAN_RATE_LIMIT_PER_HOUR } from "@/lib/config";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function checkPlanRateLimit(ip: string): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  const hour = 60 * 60 * 1000;
  const current = buckets.get(ip);
  if (!current || current.resetAt <= now) {
    buckets.set(ip, { count: 1, resetAt: now + hour });
    return { ok: true, retryAfterSec: 3600 };
  }
  if (current.count >= PLAN_RATE_LIMIT_PER_HOUR) {
    return { ok: false, retryAfterSec: Math.ceil((current.resetAt - now) / 1000) };
  }
  current.count += 1;
  return { ok: true, retryAfterSec: Math.ceil((current.resetAt - now) / 1000) };
}

export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]!.trim();
  }
  return headers.get("x-real-ip") ?? "local";
}
