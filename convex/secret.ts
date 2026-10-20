/**
 * Fail closed: if ADVANCE_STORE_SECRET is unset on the Convex deployment, or
 * the caller sends the wrong one, nothing is read or written.
 */
export function assertSecret(secret: string): void {
  const expected = process.env.ADVANCE_STORE_SECRET;
  if (!expected || expected.length < 24 || secret !== expected) {
    throw new Error("Unauthorized");
  }
}
