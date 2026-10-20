import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Shared store for Advance on Vercel. Every function checks
 * ADVANCE_STORE_SECRET (set with `npx convex env set`), so only the Next.js
 * server can read or write. Plans are stored whole as JSON.
 */
export default defineSchema({
  plans: defineTable({
    shareId: v.string(),
    status: v.union(v.literal("running"), v.literal("ready"), v.literal("error")),
    planJson: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_shareId", ["shareId"]),

  // Trimmed Qloo responses (names, ids, tags, scores), server-side only.
  qlooCache: defineTable({
    cacheKey: v.string(),
    payload: v.string(),
    createdAt: v.number(),
  }).index("by_cacheKey", ["cacheKey"]),

  rateLimits: defineTable({
    key: v.string(),
    count: v.number(),
    resetAt: v.number(),
  }).index("by_key", ["key"]),
});
