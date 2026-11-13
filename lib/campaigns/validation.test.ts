import { describe, expect, it } from "vitest";
import { parseCampaignInput } from "./validation";

const validInput = {
  name: " November Newsletter ",
  subject: " Updates ",
  previewText: " Preview ",
  content: " Hello ",
  recipientContactIds: ["one", "one", "two"],
  deliveryMode: "cron",
  messageMode: "manual",
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
        messageMode: "manual",
        templateId: null,
      },
    });
  });

  it("requires content and recipients", () => {
    expect(parseCampaignInput({ ...validInput, content: " " })).toEqual({ ok: false, error: "Email content is required." });
    expect(parseCampaignInput({ ...validInput, recipientContactIds: [] })).toEqual({ ok: false, error: "Select at least one subscribed recipient." });
  });

  it("accepts a known HTML template without manual content", () => {
    expect(
      parseCampaignInput({
        ...validInput,
        content: "",
        messageMode: "template",
        templateId: "a4a7be28-b9f8-49ea-bd1f-e0f6ef80f2b5",
      })
    ).toMatchObject({
      ok: true,
      data: {
        messageMode: "template",
        templateId: "a4a7be28-b9f8-49ea-bd1f-e0f6ef80f2b5",
      },
    });
  });

  it("rejects an unknown HTML template", () => {
    expect(
      parseCampaignInput({
        ...validInput,
        messageMode: "template",
        templateId: "unknown",
      })
    ).toEqual({ ok: false, error: "Select a valid email template." });
  });
});

