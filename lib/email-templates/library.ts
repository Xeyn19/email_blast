export const MAX_TEMPLATES_PER_BATCH = 10;

export function canSelectTemplate(
  selectedTemplateIds: string[],
  templateId: string,
) {
  return (
    selectedTemplateIds.includes(templateId) ||
    selectedTemplateIds.length < MAX_TEMPLATES_PER_BATCH
  );
}

export function removeTemplateFromLibraryState({
  templateId,
  selectedTemplateIds,
  previewTemplateId,
}: {
  templateId: string;
  selectedTemplateIds: string[];
  previewTemplateId: string;
}) {
  return {
    selectedTemplateIds: selectedTemplateIds.filter((id) => id !== templateId),
    previewTemplateId:
      previewTemplateId === templateId ? "" : previewTemplateId,
  };
}
