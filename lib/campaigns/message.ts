import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { textToEmailHtml } from "@/lib/campaigns/content";
import { compileRecipientToken } from "@/lib/email-templates/tokens";

type MessageSelection = {
  messageMode: "manual" | "template";
  templateId: string | null;
  content: string;
};

export class CampaignMessageError extends Error {}

export async function resolveCampaignMessage(
  supabase: SupabaseClient,
  userId: string,
  selection: MessageSelection
) {
  if (selection.messageMode === "manual") {
    return {
      htmlContent: textToEmailHtml(selection.content),
      templateId: null,
    };
  }

  const { data, error } = await supabase
    .from("email_templates")
    .select("id, html_content")
    .eq("id", selection.templateId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    throw new CampaignMessageError(
      "The selected email template is unavailable. Choose another template."
    );
  }

  return {
    htmlContent: compileRecipientToken(data.html_content as string),
    templateId: data.id as string,
  };
}
