import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const stepValidator = v.object({
  id: v.string(),
  at: v.number(),
  title: v.string(),
  detail: v.string(),
  endpoint: v.optional(v.string()),
  status: v.union(
    v.literal("running"),
    v.literal("done"),
    v.literal("warn"),
    v.literal("error"),
  ),
});

const planReturn = v.union(
  v.object({
    shareId: v.string(),
    status: v.union(v.literal("running"), v.literal("ready"), v.literal("error")),
    requestJson: v.string(),
    actJson: v.optional(v.string()),
    steps: v.array(stepValidator),
    routeJson: v.optional(v.string()),
    summary: v.string(),
    error: v.optional(v.string()),
    qlooMode: v.union(v.literal("mock"), v.literal("live")),
    writer: v.union(v.literal("openrouter"), v.literal("fallback")),
    thinData: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }),
  v.null(),
);

export const getByShareId = query({
  args: { shareId: v.string() },
  returns: planReturn,
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("plans")
      .withIndex("by_shareId", (q) => q.eq("shareId", args.shareId))
      .unique();
    if (!row) {
      return null;
    }
    return {
      shareId: row.shareId,
      status: row.status,
      requestJson: row.requestJson,
      actJson: row.actJson,
      steps: row.steps,
      routeJson: row.routeJson,
      summary: row.summary,
      error: row.error,
      qlooMode: row.qlooMode,
      writer: row.writer,
      thinData: row.thinData,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  },
});

export const upsert = mutation({
  args: {
    shareId: v.string(),
    status: v.union(v.literal("running"), v.literal("ready"), v.literal("error")),
    requestJson: v.string(),
    actJson: v.optional(v.string()),
    steps: v.array(stepValidator),
    routeJson: v.optional(v.string()),
    summary: v.string(),
    error: v.optional(v.string()),
    qlooMode: v.union(v.literal("mock"), v.literal("live")),
    writer: v.union(v.literal("openrouter"), v.literal("fallback")),
    thinData: v.boolean(),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("plans")
      .withIndex("by_shareId", (q) => q.eq("shareId", args.shareId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, updatedAt: now });
      return args.shareId;
    }
    await ctx.db.insert("plans", { ...args, createdAt: now, updatedAt: now });
    return args.shareId;
  },
});
