import { describe, expect, it } from "vitest";
import {
  MAX_TEMPLATES_PER_BATCH,
  canSelectTemplate,
  removeTemplateFromLibraryState,
} from "./library";

describe("email template library selection", () => {
  it("limits batch selection to ten without limiting saved templates", () => {
    const savedTemplateIds = Array.from({ length: 12 }, (_, index) =>
      `template-${index + 1}`,
    );
    const selectedTemplateIds = savedTemplateIds.slice(
      0,
      MAX_TEMPLATES_PER_BATCH,
    );

    expect(savedTemplateIds).toHaveLength(12);
    expect(canSelectTemplate(selectedTemplateIds, "template-11")).toBe(false);
    expect(canSelectTemplate(selectedTemplateIds, "template-1")).toBe(true);
  });

  it("removes a deleted template without silently selecting another preview", () => {
    expect(
      removeTemplateFromLibraryState({
        templateId: "template-2",
        selectedTemplateIds: ["template-1", "template-2", "template-3"],
        previewTemplateId: "template-2",
      }),
    ).toEqual({
      selectedTemplateIds: ["template-1", "template-3"],
      previewTemplateId: "",
    });
  });

  it("keeps an unrelated preview when another template is deleted", () => {
    expect(
      removeTemplateFromLibraryState({
        templateId: "template-2",
        selectedTemplateIds: ["template-1", "template-2"],
        previewTemplateId: "template-1",
      }),
    ).toEqual({
      selectedTemplateIds: ["template-1"],
      previewTemplateId: "template-1",
    });
  });
});
