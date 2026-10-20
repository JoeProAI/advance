import { describe, expect, it } from "vitest";
import { DESK_FAILURES, deskCopyForPlanError } from "@/lib/desk-states";
import {
  QLOO_401_MESSAGE,
  QLOO_403_MESSAGE,
  QlooHttpError,
  isAuthOrTypeError,
} from "@/lib/qloo/errors";

describe("Qloo HTTP errors map to the designed qloo failure", () => {
  it("turns 401 into a wrong-key message", () => {
    const error = new QlooHttpError(401, "/v2/insights", "No API key found in request");
    expect(error.message).toBe(QLOO_401_MESSAGE);
    expect(isAuthOrTypeError(error)).toBe(true);
    const copy = deskCopyForPlanError(error);
    expect(copy?.state).toBe("qloo");
    expect(copy?.stamp).toBe(DESK_FAILURES.qloo.stamp);
    expect(copy?.body).toMatch(/Wrong or missing Qloo key/);
    expect(copy?.body).toMatch(/X-Api-Key/);
  });

  it("turns 403 into an unsupported-type message", () => {
    const error = new QlooHttpError(403, "/v2/insights", "You do not have permission to access urn:heatmap");
    expect(error.message).toBe(QLOO_403_MESSAGE);
    expect(isAuthOrTypeError(error)).toBe(true);
    const copy = deskCopyForPlanError(error.message);
    expect(copy?.state).toBe("qloo");
    expect(copy?.body).toMatch(/does not support that entity type/);
  });

  it("maps an empty heatmap 200 to the designed no-heatmap state", () => {
    const copy = deskCopyForPlanError(
      "The heatmap came back empty. There is no run to route until Qloo names a city.",
    );
    expect(copy).toEqual(DESK_FAILURES["no-heatmap"]);
  });

  it("leaves ordinary errors off the qloo failure sheet", () => {
    expect(deskCopyForPlanError("Send a JSON body.")).toBeNull();
    expect(isAuthOrTypeError(new Error("network"))).toBe(false);
    expect(isAuthOrTypeError(new QlooHttpError(500, "/search", "boom"))).toBe(false);
  });
});
