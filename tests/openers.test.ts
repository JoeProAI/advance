import { describe, expect, it } from "vitest";
import { assignOpeners, isFromCity, rejectOpener } from "@/lib/agent/openers";
import { findCity } from "@/lib/geo/cities";
import type { QlooEntity } from "@/lib/qloo/types";
import type { ResolvedAct } from "@/lib/types";

const act: ResolvedAct = { entityId: "act", name: "Wednesday", kind: "artist", description: "", popularity: 0.955 };

function artist(id: string, props: Record<string, unknown> = {}, popularity = 0.9): QlooEntity {
  return { entity_id: id, name: id, popularity, properties: props } as unknown as QlooEntity;
}

describe("opener plausibility", () => {
  it("drops legacy and household names, keeps peers", () => {
    expect(rejectOpener(artist("Kim Gordon", { start_year: ["1981"], obscurity_scale: ["2"] }), act, 2026)).toBe("legacy");
    expect(rejectOpener(artist("Big Pop", { start_year: ["2015"], obscurity_scale: ["1"] }), act, 2026)).toBe("household-name");
    expect(rejectOpener(artist("Ratboys", { start_year: ["2010"], obscurity_scale: ["4"] }), act, 2026)).toBeUndefined();
    expect(rejectOpener(artist("Bigger", {}, 0.99), act, 2026)).toBe("above-headliner");
    expect(rejectOpener(artist("act"), act, 2026)).toBe("self");
  });
});

describe("hometown match", () => {
  it("reads birthplace and the start of the bio", () => {
    expect(isFromCity(artist("a", { biography: "Ratboys formed in Chicago in 2010." }), findCity("Chicago")!)).toBe(true);
    expect(isFromCity(artist("b", { place_of_birth: "Washington, D.C." }), findCity("Washington")!)).toBe(true);
    expect(isFromCity(artist("c", { place_of_birth: "Washington, Pennsylvania" }), findCity("Washington")!)).toBe(false);
  });

  it("needs the state for names that exist twice", () => {
    expect(isFromCity(artist("d", { biography: "Formed in Portland, Maine." }), findCity("Portland")!)).toBe(false);
    expect(isFromCity(artist("e", { biography: "Formed in Portland, Oregon." }), findCity("Portland")!)).toBe(true);
    expect(isFromCity(artist("f", { biography: "From Columbus, OH." }), findCity("Columbus")!)).toBe(true);
  });

  it("ignores cities mentioned late in a bio", () => {
    const bio = `${"x".repeat(260)} later toured through Atlanta.`;
    expect(isFromCity(artist("g", { biography: bio }), findCity("Atlanta")!)).toBe(false);
  });
});

describe("assigning openers across the run", () => {
  const cities = ["Atlanta", "Nashville", "Louisville"].map((name) => findCity(name)!);

  it("books no one twice while the pool lasts and puts locals first", () => {
    const pool = [
      artist("A"),
      artist("B"),
      artist("C"),
      artist("Local Nash", { biography: "Formed in Nashville." }),
      artist("D"),
      artist("E"),
    ];
    const plan = assignOpeners(pool, cities);
    const names = plan.flat().map((pick) => pick.entity.name);
    expect(new Set(names).size).toBe(names.length);
    expect(plan[1]![0]!.entity.name).toBe("Local Nash");
    expect(plan[1]![0]!.local).toBe(true);
  });

  it("repeats only when the pool runs out, and says so", () => {
    const plan = assignOpeners([artist("A"), artist("B"), artist("C")], cities);
    expect(plan[0]!.map((p) => p.entity.name)).toEqual(["A", "B"]);
    expect(plan[1]![0]!.entity.name).toBe("C");
    expect(plan[1]![1]!.repeat).toBe(true);
  });
});

describe("opener headroom cap", () => {
  it("caps openers at twice the headliner's distance from the top", async () => {
    const { openerPopularityCap } = await import("@/lib/agent/openers");
    // Lenderman at 0.965 -> cap 0.930, which drops Wednesday at 0.964.
    expect(openerPopularityCap(0.965)).toBeCloseTo(0.93, 3);
    expect(openerPopularityCap(0.5)).toBeCloseTo(0.05, 3); // floor
    expect(rejectOpener(artist("Peer", {}, 0.964), { ...act, popularity: 0.965 }, 2026)).toBe("peer-draw");
  });
});

describe("related acts", () => {
  it("flags openers whose bio names the headliner, and family names", async () => {
    const { isRelatedAct } = await import("@/lib/agent/openers");
    const lenderman = { name: "MJ Lenderman", description: "Asheville songwriter.", bio: "MJ Lenderman also plays in the band Wednesday." };
    const wednesday = artist("wed", { biography: "Wednesday is an Asheville band featuring MJ Lenderman." });
    expect(isRelatedAct(wednesday, lenderman)).toBe(true);
    const waxahatchee = { name: "Waxahatchee", description: "Waxahatchee is Katie Crutchfield." };
    const allison = { entity_id: "ac", name: "Allison Crutchfield", popularity: 0.8, properties: { biography: "Alabama songwriter." } } as unknown as Parameters<typeof isRelatedAct>[0];
    expect(isRelatedAct(allison, waxahatchee)).toBe(true);
    const stranger = artist("ratboys", { biography: "Ratboys formed in Chicago." });
    expect(isRelatedAct(stranger, lenderman)).toBe(false);
  });
});
