type MessageSelection = {
  messageMode: "manual" | "template";
  templateId: string | null;
  content: string;
};

type ExistingCampaignMessage = {
  messageMode: "manual" | "template";
  templateId: string | null;
  htmlContent: string;
};

export function preserveExistingTemplateSnapshot(
  existing: ExistingCampaignMessage,
  selection: MessageSelection,
) {
  if (
    selection.messageMode === "template" &&
    existing.messageMode === "template" &&
    existing.templateId === selection.templateId
  ) {
    return {
      htmlContent: existing.htmlContent,
      templateId: existing.templateId,
    };
  }

  return null;
}
