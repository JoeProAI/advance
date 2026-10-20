# Convex store

Advance uses Convex as its shared store when `CONVEX_URL` is set: plans and their steps (`plans`), trimmed Qloo responses (`qlooCache`), and the plan rate limiter (`rateLimits`). Without `CONVEX_URL` the app uses the file store under `.data/`.

Every function takes a `secret` argument and checks it against `ADVANCE_STORE_SECRET` on the deployment (`secret.ts`). Unset or wrong, the call fails. Only the Next.js server holds the secret, so browsers cannot read or write these tables directly. Do not add list-all queries.

`convex/_generated/` is created by `npx convex dev` or `npx convex deploy`. The Next.js side does not import it; it calls functions by name through `anyApi`.

Deploy steps are in the main README under "Deploy to Vercel with Convex".
