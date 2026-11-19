import { NextResponse } from "next/server";
import {
  CampaignBatchError,
  prepareAndArmSingleCampaign,
  removeCampaignFromBatch,
} from "@/lib/campaign-batches/service";
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
    const result = await prepareAndArmSingleCampaign(supabase, id, user.id);
    return NextResponse.json({ success: true, ...result, status: "waiting_for_cron" });
  } catch (serviceError) {
    if (serviceError instanceof CampaignBatchError) {
      return NextResponse.json({
        error: serviceError.message,
        code: serviceError.code,
        batchId: serviceError.batchId,
      }, { status: serviceError.status });
    }
    return NextResponse.json({ error: "Unable to prepare this campaign for cron." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const { supabase, user, error } = await getAuthenticatedContext();
  if (error || !user) return NextResponse.json({ error: "Your session has expired. Please log in again." }, { status: 401 });

  const { data: item, error: itemError } = await supabase
    .from("campaign_batch_items")
    .select("batch_id, campaign_batches!inner(user_id, status)")
    .eq("campaign_id", id)
    .eq("campaign_batches.user_id", user.id)
    .maybeSingle();
  if (itemError) return NextResponse.json({ error: "Unable to find this campaign's delivery batch." }, { status: 500 });
  if (!item) return NextResponse.json({ error: "This campaign is not waiting for cron." }, { status: 409 });
  try {
    const result = await removeCampaignFromBatch(
      item.batch_id as string,
      id,
      user.id,
    );
    return NextResponse.json({ success: true, campaignId: id, ...result });
  } catch (serviceError) {
    if (serviceError instanceof CampaignBatchError) {
      return NextResponse.json({ error: serviceError.message, code: serviceError.code }, { status: serviceError.status });
    }
    return NextResponse.json({ error: "Unable to remove this campaign from cron." }, { status: 500 });
  }
}

