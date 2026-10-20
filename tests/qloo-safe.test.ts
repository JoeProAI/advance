import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parsePlanRequest } from "@/lib/plan-request";
import { assertPublicCulturalQuery } from "@/lib/qloo/signals";
import { HARNESS_WORKFLOW_USES, HARNESS_WORKFLOWS } from "@/lib/qloo/workflows";
import { QLOO_HACKATHON_HOST } from "@/lib/config";

describe("public cultural signals", () => {
  it("accepts an act name and a city", () => {
    expect(assertPublicCulturalQuery("Act", "Simon & Garfunkel")).toBe(
      "Simon & Garfunkel",
    );
    expect(assertPublicCulturalQuery("Home city", "Chicago")).toBe("Chicago");
  });

  it("rejects email, phone, and device identifiers", () => {
    expect(() => assertPublicCulturalQuery("Act", "booker@example.com")).toThrow(/email/);
    expect(() => assertPublicCulturalQuery("Act", "+15551234567")).toThrow(/phone/);
    expect(() => assertPublicCulturalQuery("Act", "idfa:AAAA-BBBB")).toThrow(/device/);
  });

  it("blocks personal data on the plan request before any Qloo call", () => {
    expect(() => parsePlanRequest({ actName: "ada@tour.example" })).toThrow(/email/);
    expect(() =>
      parsePlanRequest({ actName: "Rina Voss", homeCity: "imei:123456789012345" }),
    ).toThrow(/device/);
  });
});

describe("harness workflow citation", () => {
  it("covers all nine official workflows", () => {
    expect(new Set(HARNESS_WORKFLOW_USES.map((row) => row.workflow))).toEqual(
      new Set(HARNESS_WORKFLOWS),
    );
    expect(HARNESS_WORKFLOW_USES).toHaveLength(HARNESS_WORKFLOWS.length);
  });

  it("adopts eight product workflows and leaves demographics unused", () => {
    const adopted = HARNESS_WORKFLOW_USES.filter((row) => row.adopted).map((row) => row.workflow);
    const unused = HARNESS_WORKFLOW_USES.filter((row) => !row.adopted).map((row) => row.workflow);
    expect(adopted).toContain("where_popular");
    expect(adopted).toContain("compare_audiences");
    expect(unused).toEqual(["audience_demographics"]);
  });
});

describe("live Qloo transport", () => {
  it("uses the hackathon host, GET, and X-Api-Key on the server", () => {
    const live = readFileSync("lib/qloo/live.ts", "utf8");
    const request = readFileSync("lib/qloo/request.ts", "utf8");
    const clientDir = ["lib/qloo/live.ts", "lib/qloo/request.ts", "lib/qloo/client.ts", "lib/qloo/mock.ts"];
    expect(QLOO_HACKATHON_HOST).toBe("https://hackathon.api.qloo.com");
    expect(live).toContain("buildQlooRequest");
    expect(live).toContain("typeof window");
    expect(request).toContain('method: "GET"');
    expect(request).toContain("X-Api-Key");
    expect(request).toContain("https://docs.qloo.com/reference/insights-api-deep-dive");
    for (const file of clientDir) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toContain("/recommendations");
      expect(source).not.toMatch(/(^|[^a-z])\/recs([^a-z]|$)/);
      expect(source).not.toContain("Bearer");
      expect(source).not.toMatch(/Authorization/);
      expect(source).not.toMatch(/method:\s*["']POST["']/);
    }
  });
});
