export type CampaignInput = {
  name: string;
  subject: string;
  previewText?: string | null;
  content: string;
  recipientContactIds: string[];
  deliveryMode?: "draft" | "cron";
  messageMode: "manual" | "template";
  templateId: string | null;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseCampaignInput(value: unknown):
  | { ok: true; data: CampaignInput }
  | { ok: false; error: string } {
  if (!value || typeof value !== "object") {
    return { ok: false, error: "Campaign details are required." };
  }

  const input = value as Record<string, unknown>;
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const subject =
    typeof input.subject === "string" ? input.subject.trim() : "";
  const content =
    typeof input.content === "string" ? input.content.trim() : "";
  const previewText =
    typeof input.previewText === "string"
      ? input.previewText.trim()
      : null;
  const recipientContactIds = Array.isArray(input.recipientContactIds)
    ? [...new Set(input.recipientContactIds)].filter(
        (id): id is string => typeof id === "string" && id.length > 0
      )
    : [];
  const deliveryMode = input.deliveryMode === "cron" ? "cron" : "draft";
  const messageMode = input.messageMode === "template" ? "template" : "manual";
  const templateId =
    typeof input.templateId === "string" && UUID_PATTERN.test(input.templateId)
      ? input.templateId
      : null;

  if (!name) return { ok: false, error: "Campaign name is required." };
  if (!subject) return { ok: false, error: "Email subject is required." };
  if (messageMode === "manual" && !content) {
    return { ok: false, error: "Email content is required." };
  }
  if (messageMode === "template" && !templateId) {
    return { ok: false, error: "Select a valid email template." };
  }
  if (recipientContactIds.length === 0) {
    return { ok: false, error: "Select at least one subscribed recipient." };
  }

  return {
    ok: true,
    data: {
      name,
      subject,
      previewText,
      content,
      recipientContactIds,
      deliveryMode,
      messageMode,
      templateId: messageMode === "template" ? templateId : null,
    },
  };
}

