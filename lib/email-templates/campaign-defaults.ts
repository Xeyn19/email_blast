export type TemplateCampaignDefaults = {
  name: string;
  defaultCampaignName?: string | null;
  defaultSubject?: string | null;
  defaultPreviewText?: string | null;
};

export function getCampaignDetailsFromTemplate(
  template: TemplateCampaignDefaults,
) {
  return {
    name: template.defaultCampaignName?.trim() || template.name,
    subject: template.defaultSubject?.trim() || template.name,
    previewText: template.defaultPreviewText?.trim() || "",
  };
}
