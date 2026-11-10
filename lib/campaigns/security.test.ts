import { describe, expect, it } from "vitest";
import { isValidCronToken } from "./security";

describe("cron token authentication", () => {
  it("accepts an exact configured token", () => {
    expect(isValidCronToken("a-long-secret", "a-long-secret")).toBe(true);
  });

  it("rejects missing, different, and different-length tokens", () => {
    expect(isValidCronToken(null, "a-long-secret")).toBe(false);
    expect(isValidCronToken("wrong-secret", "a-long-secret")).toBe(false);
    expect(isValidCronToken("short", "a-long-secret")).toBe(false);
  });
});

