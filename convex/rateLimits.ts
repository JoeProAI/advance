import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { assertSecret } from "./secret";

/** Fixed-window counter. One transaction, so concurrent hits cannot over-admit. */
export const hit = mutation({
  args: { secret: v.string(), key: v.string(), limit: v.number(), windowMs: v.number() },
  returns: v.object({ ok: v.boolean(), retryAfterSec: v.number() }),
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    const now = Date.now();
    const row = await ctx.db
      .query("rateLimits")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    if (!row || row.resetAt <= now) {
      const resetAt = now + args.windowMs;
      if (row) {
        await ctx.db.patch(row._id, { count: 1, resetAt });
      } else {
        await ctx.db.insert("rateLimits", { key: args.key, count: 1, resetAt });
      }
      return { ok: true, retryAfterSec: Math.ceil(args.windowMs / 1000) };
    }
    const retryAfterSec = Math.ceil((row.resetAt - now) / 1000);
    if (row.count >= args.limit) {
      return { ok: false, retryAfterSec };
    }
    await ctx.db.patch(row._id, { count: row.count + 1 });
    return { ok: true, retryAfterSec };
  },
});
