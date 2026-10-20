# Convex (optional)

The app ships with a file store under `.data/` so mock-mode demos and share links work with no Convex account.

To switch shareable plans and the Qloo response cache onto Convex:

1. `npx convex dev` (use `CONVEX_AGENT_MODE=anonymous` only for cloud agents)
2. Copy `NEXT_PUBLIC_CONVEX_URL` into `.env.local`
3. Keep using the Next.js API routes — they are the public surface. Wire `lib/storage` to Convex when you want the hosted store.

These functions are public because plans are anonymous share documents, not user records. Do not add a list-all-plans query.
