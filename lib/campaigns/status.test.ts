import { describe, expect, it } from "vitest";
import { mapBrevoStatus } from "./status";

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

