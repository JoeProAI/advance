import { describe, expect, it } from "vitest";
import {
  DESK_FAILURES,
  DESK_STATES,
  demoPartialPlan,
  deskCopyForPlanError,
  isDeskState,
  parseDeskState,
} from "@/lib/desk-states";
import { QLOO_401_MESSAGE } from "@/lib/qloo/errors";
import { parsePlanRequest } from "@/lib/plan-request";

describe("desk preview state flags", () => {
  it("lists every required failure and loading flag", () => {
    expect(DESK_STATES).toEqual([
      "offline",
      "qloo",
      "qloo-timeout",
      "partial",
      "no-heatmap",
      "act-not-found",
      "invalid-date",
      "openrouter",
      "not-found",
      "loading",
    ]);
  });

  it("parses only known flags", () => {
    expect(parseDeskState("qloo")).toBe("qloo");
    expect(parseDeskState("nope")).toBeNull();
    expect(isDeskState("offline")).toBe(true);
    expect(isDeskState("purple")).toBe(false);
  });

  it("gives each failure a stamp, body, and recovery action", () => {
    for (const state of DESK_STATES) {
      if (state === "loading" || state === "partial") {
        continue;
      }
      const copy = DESK_FAILURES[state];
      expect(copy.title.length).toBeGreaterThan(4);
      expect(copy.body.length).toBeGreaterThan(12);
      expect(copy.recovery.href.startsWith("/")).toBe(true);
      expect(copy.recovery.label.length).toBeGreaterThan(3);
      expect(copy.body.includes("—")).toBe(false);
    }
  });

  it("builds a partial-data plan with a held room", () => {
    const plan = demoPartialPlan();
    expect(plan.thinData).toBe(true);
    expect(plan.route?.stops.some((stop) => stop.venue.name === "Hold")).toBe(true);
    expect(plan.route?.stops.some((stop) => stop.venue.name !== "Hold")).toBe(true);
    const affinities = plan.route!.stops.map((stop) => stop.affinity);
    expect(new Set(affinities).size).toBe(affinities.length);
    for (const stop of plan.route!.stops) {
      expect(stop.venue.why.includes("live crowd")).toBe(false);
      expect(stop.venue.why.length).toBeGreaterThan(20);
    }
  });

  it("maps a 401 message onto the designed qloo failure", () => {
    const copy = deskCopyForPlanError(QLOO_401_MESSAGE);
    expect(copy?.state).toBe("qloo");
    expect(copy?.body).toBe(QLOO_401_MESSAGE);
  });

  it("rejects an invalid start date", () => {
    expect(() =>
      parsePlanRequest({
        actName: "Marlow & the Night Shifts",
        startDate: "friday-ish",
      }),
    ).toThrow(/calendar day/);
  });
});
