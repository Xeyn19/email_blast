export type CampaignInput = {
  name: string;
  subject: string;
  previewText?: string | null;
  content: string;
  recipientContactIds: string[];
  deliveryMode?: "draft" | "cron";
};

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

  if (!name) return { ok: false, error: "Campaign name is required." };
  if (!subject) return { ok: false, error: "Email subject is required." };
  if (!content) return { ok: false, error: "Email content is required." };
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
    },
  };
}

