import { describe, expect, it } from "vitest";
import { preserveExistingTemplateSnapshot } from "./message-snapshot";

describe("preserveExistingTemplateSnapshot", () => {
  const existing = {
    messageMode: "template" as const,
    templateId: "4b471f76-aac2-49fb-8b3b-fd669a534b11",
    htmlContent: "<p>Saved {{ contact.RECIPIENT_NAME }}</p>",
  };

  it("keeps the immutable HTML snapshot when the selected template is unchanged", () => {
    expect(
      preserveExistingTemplateSnapshot(existing, {
        messageMode: "template",
        templateId: existing.templateId,
        content: "",
      }),
    ).toEqual({
      htmlContent: existing.htmlContent,
      templateId: existing.templateId,
    });
  });

  it("requires fresh resolution when the selected template changes", () => {
    expect(
      preserveExistingTemplateSnapshot(existing, {
        messageMode: "template",
        templateId: "fbe314d4-5e69-470f-b8f4-128bd0383074",
        content: "",
      }),
    ).toBeNull();
  });

  it("requires fresh resolution when switching to manual text", () => {
    expect(
      preserveExistingTemplateSnapshot(existing, {
        messageMode: "manual",
        templateId: null,
        content: "New message",
      }),
    ).toBeNull();
  });
});
