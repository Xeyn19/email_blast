import { describe, expect, it } from "vitest";
import { parseCampaignInput } from "./validation";

const validInput = {
  name: " November Newsletter ",
  subject: " Updates ",
  previewText: " Preview ",
  content: " Hello ",
  recipientContactIds: ["one", "one", "two"],
  deliveryMode: "cron",
};

describe("campaign input validation", () => {
  it("normalizes a valid cron campaign", () => {
    expect(parseCampaignInput(validInput)).toEqual({
      ok: true,
      data: {
        name: "November Newsletter",
        subject: "Updates",
        previewText: "Preview",
        content: "Hello",
        recipientContactIds: ["one", "two"],
        deliveryMode: "cron",
      },
    });
  });

  it("requires content and recipients", () => {
    expect(parseCampaignInput({ ...validInput, content: " " })).toEqual({ ok: false, error: "Email content is required." });
    expect(parseCampaignInput({ ...validInput, recipientContactIds: [] })).toEqual({ ok: false, error: "Select at least one subscribed recipient." });
  });
});

