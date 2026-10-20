import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { assertSecret } from "./secret";

const status = v.union(v.literal("running"), v.literal("ready"), v.literal("error"));

export const get = query({
  args: { secret: v.string(), shareId: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    const row = await ctx.db
      .query("plans")
      .withIndex("by_shareId", (q) => q.eq("shareId", args.shareId))
      .unique();
    return row?.planJson ?? null;
  },
});

export const save = mutation({
  args: { secret: v.string(), shareId: v.string(), status, planJson: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    const now = Date.now();
    const existing = await ctx.db
      .query("plans")
      .withIndex("by_shareId", (q) => q.eq("shareId", args.shareId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { status: args.status, planJson: args.planJson, updatedAt: now });
      return null;
    }
    await ctx.db.insert("plans", {
      shareId: args.shareId,
      status: args.status,
      planJson: args.planJson,
      createdAt: now,
      updatedAt: now,
    });
    return null;
  },
});

/** Atomic append so parallel agent steps never overwrite each other. */
export const appendStep = mutation({
  args: { secret: v.string(), shareId: v.string(), stepJson: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    const row = await ctx.db
      .query("plans")
      .withIndex("by_shareId", (q) => q.eq("shareId", args.shareId))
      .unique();
    if (!row) {
      return null;
    }
    const plan = JSON.parse(row.planJson) as { steps?: unknown[]; updatedAt?: number };
    const now = Date.now();
    plan.steps = [...(plan.steps ?? []), JSON.parse(args.stepJson) as unknown];
    plan.updatedAt = now;
    const planJson = JSON.stringify(plan);
    await ctx.db.patch(row._id, { planJson, updatedAt: now });
    return planJson;
  },
});
