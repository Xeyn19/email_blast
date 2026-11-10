import { NextResponse } from "next/server";
import { CampaignServiceError, prepareAndArmCampaign } from "@/lib/campaigns/service";
import { createClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ id: string }> };

async function getAuthenticatedContext() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  return { supabase, user, error };
}

export async function POST(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const { supabase, user, error } = await getAuthenticatedContext();
  if (error || !user) return NextResponse.json({ error: "Your session has expired. Please log in again." }, { status: 401 });

  try {
    const { data: existingCampaign } = await supabase
      .from("campaigns")
      .select("status")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingCampaign?.status === "failed") {
      const { error: resetError } = await supabase
        .from("campaigns")
        .update({
          status: "draft",
          brevo_campaign_id: null,
          brevo_synced_at: null,
          last_error: null,
          send_attempted_at: null,
          status_checked_at: null,
        })
        .eq("id", id)
        .eq("user_id", user.id)
        .eq("status", "failed");
      if (resetError) {
        return NextResponse.json({ error: "Unable to reset this campaign for another attempt." }, { status: 500 });
      }
    }

    const result = await prepareAndArmCampaign(supabase, id, user.id);
    return NextResponse.json({ success: true, ...result, status: "waiting_for_cron" });
  } catch (serviceError) {
    if (serviceError instanceof CampaignServiceError) {
      return NextResponse.json({
        error: serviceError.message,
        code: serviceError.code,
        conflictingCampaignId: serviceError.code === "cron_slot_occupied" ? serviceError.campaignId : undefined,
      }, { status: serviceError.status });
    }
    return NextResponse.json({ error: "Unable to prepare this campaign for cron." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const { supabase, user, error } = await getAuthenticatedContext();
  if (error || !user) return NextResponse.json({ error: "Your session has expired. Please log in again." }, { status: 401 });

  const { data, error: updateError } = await supabase
    .from("campaigns")
    .update({ cron_armed_at: null })
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("status", "draft")
    .not("cron_armed_at", "is", null)
    .select("id")
    .maybeSingle();

  if (updateError) return NextResponse.json({ error: "Unable to remove this campaign from cron." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "This campaign is not waiting for cron." }, { status: 409 });
  return NextResponse.json({ success: true, campaignId: id });
}

