import { defineSchema, defineTable } from "convex/server";
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

export default defineSchema({
  plans: defineTable({
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
  }).index("by_shareId", ["shareId"]),

  qlooCache: defineTable({
    cacheKey: v.string(),
    payload: v.string(),
    createdAt: v.number(),
  }).index("by_cacheKey", ["cacheKey"]),
});
