import { describe, expect, it } from "vitest";
import { getDeliverabilityError } from "./deliverability";

describe("getDeliverabilityError", () => {
  it("accepts a list when every selected recipient is deliverable", () => {
    expect(getDeliverabilityError(100, 100)).toBeNull();
  });

  it("explains when Brevo has no deliverable recipients", () => {
    expect(getDeliverabilityError(100, 0)).toContain(
      "None of the selected recipients"
    );
  });

  it("reports a partially suppressed audience", () => {
    expect(getDeliverabilityError(100, 75)).toContain("75 of 100");
  });
});
