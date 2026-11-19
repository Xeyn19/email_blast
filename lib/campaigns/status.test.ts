import { describe, expect, it } from "vitest";
import { deriveBatchAggregateStatus, mapBrevoStatus } from "./status";

describe("Brevo status mapping", () => {
  it("maps sent and stopped campaigns to terminal states", () => {
    expect(mapBrevoStatus("sent", "sending")).toEqual({ status: "sent", terminal: true });
    expect(mapBrevoStatus("suspended", "sending")).toEqual({ status: "failed", terminal: true });
  });

  it("keeps active provider states sending", () => {
    expect(mapBrevoStatus("queued", "sending")).toEqual({ status: "sending", terminal: false });
  });

  it("does not invent a transition for an unknown provider state", () => {
    expect(mapBrevoStatus("unknown", "sending")).toEqual({ status: "sending", terminal: false });
  });
});

describe("delivery batch status aggregation", () => {
  it("completes a batch when every campaign is sent", () => {
    expect(deriveBatchAggregateStatus(["sent", "sent"])).toBe("completed");
  });

  it("keeps a batch sending while any campaign is active", () => {
    expect(deriveBatchAggregateStatus(["sent", "sending"])).toBe("sending");
  });

  it("marks terminal failures and unexpected drafts for attention", () => {
    expect(deriveBatchAggregateStatus(["sent", "failed"])).toBe(
      "completed_with_errors"
    );
    expect(deriveBatchAggregateStatus(["sent", "draft"])).toBe(
      "completed_with_errors"
    );
    expect(deriveBatchAggregateStatus([])).toBe("completed_with_errors");
  });
});

