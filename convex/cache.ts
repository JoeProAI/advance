import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const get = query({
  args: { cacheKey: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("qlooCache")
      .withIndex("by_cacheKey", (q) => q.eq("cacheKey", args.cacheKey))
      .unique();
    return row?.payload ?? null;
  },
});

export const set = mutation({
  args: { cacheKey: v.string(), payload: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("qlooCache")
      .withIndex("by_cacheKey", (q) => q.eq("cacheKey", args.cacheKey))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { payload: args.payload, createdAt: Date.now() });
      return null;
    }
    await ctx.db.insert("qlooCache", {
      cacheKey: args.cacheKey,
      payload: args.payload,
      createdAt: Date.now(),
    });
    return null;
  },
});
