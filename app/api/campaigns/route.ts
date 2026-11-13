import { NextResponse } from "next/server";
import { CampaignServiceError, prepareAndArmCampaign } from "@/lib/campaigns/service";
import {
  CampaignMessageError,
  resolveCampaignMessage,
} from "@/lib/campaigns/message";
import { parseCampaignInput } from "@/lib/campaigns/validation";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Your session has expired. Please log in again." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "The campaign request is not valid JSON." }, { status: 400 });
  }

  const parsed = parseCampaignInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const input = parsed.data;
  let message;
  try {
    message = await resolveCampaignMessage(supabase, user.id, input);
  } catch (error) {
    if (error instanceof CampaignMessageError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Unable to prepare the campaign message." },
      { status: 500 }
    );
  }
  const { data: campaign, error } = await supabase
    .from("campaigns")
    .insert({
      user_id: user.id,
      name: input.name,
      subject: input.subject,
      preview_text: input.previewText || null,
      html_content: message.htmlContent,
      message_mode: input.messageMode,
      template_id: message.templateId,
      recipient_contact_ids: input.recipientContactIds,
      status: "draft",
    })
    .select("id")
    .single();

  if (error || !campaign) {
    return NextResponse.json({ error: "Unable to save this campaign." }, { status: 500 });
  }

  if (input.deliveryMode === "draft") {
    return NextResponse.json({ success: true, campaignId: campaign.id, status: "draft" }, { status: 201 });
  }

  try {
    const result = await prepareAndArmCampaign(supabase, campaign.id, user.id);
    return NextResponse.json({ success: true, ...result, status: "waiting_for_cron" }, { status: 201 });
  } catch (serviceError) {
    if (serviceError instanceof CampaignServiceError) {
      return NextResponse.json({
        error: serviceError.message,
        code: serviceError.code,
        campaignId: campaign.id,
        savedAsDraft: true,
        conflictingCampaignId: serviceError.code === "cron_slot_occupied" ? serviceError.campaignId : undefined,
      }, { status: serviceError.status });
    }

    return NextResponse.json({
      error: "Your draft was saved, but the campaign could not be prepared for cron.",
      campaignId: campaign.id,
      savedAsDraft: true,
    }, { status: 500 });
  }
}

