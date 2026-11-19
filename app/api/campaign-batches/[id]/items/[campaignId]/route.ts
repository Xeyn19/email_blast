import { NextResponse } from "next/server";
import { CampaignBatchError, removeCampaignFromBatch } from "@/lib/campaign-batches/service";
import { createClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ id: string; campaignId: string }> };

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { id, campaignId } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Your session has expired. Please log in again." }, { status: 401 });
  try {
    return NextResponse.json(await removeCampaignFromBatch(id, campaignId, user.id));
  } catch (error) {
    if (error instanceof CampaignBatchError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Unable to remove this campaign from the delivery batch." }, { status: 500 });
  }
}
