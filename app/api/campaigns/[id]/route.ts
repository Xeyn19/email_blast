import { NextResponse } from "next/server";
import {
  CampaignMessageError,
  resolveCampaignMessage,
} from "@/lib/campaigns/message";
import { preserveExistingTemplateSnapshot } from "@/lib/campaigns/message-snapshot";
import { parseCampaignInput } from "@/lib/campaigns/validation";
import { createClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Your session has expired. Please log in again." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const parsed = parseCampaignInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const input = parsed.data;
  const { data: existingCampaign, error: existingError } = await supabase
    .from("campaigns")
    .select("html_content, message_mode, template_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("status", "draft")
    .is("cron_armed_at", null)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json(
      { error: "Unable to load the saved campaign." },
      { status: 500 },
    );
  }

  if (!existingCampaign) {
    return NextResponse.json(
      { error: "Remove this campaign from cron before editing, then try again." },
      { status: 409 },
    );
  }

  let message;
  try {
    message =
      preserveExistingTemplateSnapshot(
        {
          messageMode: existingCampaign.message_mode,
          templateId: existingCampaign.template_id,
          htmlContent: existingCampaign.html_content,
        },
        input,
      ) ?? (await resolveCampaignMessage(supabase, user.id, input));
  } catch (error) {
    if (error instanceof CampaignMessageError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Unable to prepare the campaign message." },
      { status: 500 }
    );
  }
  const { data, error } = await supabase
    .from("campaigns")
    .update({
      name: input.name,
      subject: input.subject,
      preview_text: input.previewText || null,
      html_content: message.htmlContent,
      message_mode: input.messageMode,
      template_id: message.templateId,
      recipient_contact_ids: input.recipientContactIds,
      brevo_list_id: null,
      brevo_campaign_id: null,
      brevo_synced_at: null,
      last_error: null,
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("status", "draft")
    .is("cron_armed_at", null)
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: "Unable to save campaign changes." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Remove this campaign from cron before editing, then try again." }, { status: 409 });
  return NextResponse.json({ success: true, campaignId: id });
}
