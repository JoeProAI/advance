import { describe, expect, it } from "vitest";
import { wrongRoom } from "@/lib/agent/rooms";
import type { QlooEntity } from "@/lib/qloo/types";

function venue(name: string, tags: string[] = []): QlooEntity {
  return {
    entity_id: `id-${name}`,
    name,
    tags: tags.map((tag) => ({ name: tag, type: "urn:tag:category:place" })),
  } as unknown as QlooEntity;
}

describe("wrongRoom", () => {
  it("rejects the rooms from the Oct 29 live audit", () => {
    expect(wrongRoom(venue("Hardcore Stadium", ["Live music venue", "Stadium"]))).toMatch(/stadium/i);
    expect(wrongRoom(venue("The Cleveland Orchestra", ["Orchestra"]))).toBeTruthy();
    expect(wrongRoom(venue("Static Age Records", ["Record store"]))).toBeTruthy();
    expect(wrongRoom(venue("Philadelphia Museum of Art", ["Art museum"]))).toBeTruthy();
    expect(wrongRoom(venue("Third Man Records", ["Live music venue"]))).toBeTruthy();
  });

  it("rejects symphony and speedway names even without tags", () => {
    expect(wrongRoom(venue("Capital City Symphony"))).toBeTruthy();
    expect(wrongRoom(venue("Northfield Speedway"))).toBeTruthy();
  });

  it("keeps real clubs and theaters", () => {
    expect(wrongRoom(venue("The Bowery Ledger", ["Live music venue", "Intimate"]))).toBeUndefined();
    expect(wrongRoom(venue("U Street Civic", ["Concert hall"]))).toBeUndefined();
    // Known false positive from the audit: a real venue tagged Record store.
    // It is rejected, and the picker falls through to the next room.
    expect(wrongRoom(venue("Mahall's", ["Record store"]))).toBeTruthy();
  });
});
