import { NextResponse } from "next/server";
import {
  CampaignBatchError,
  createBatchFromCampaigns,
} from "@/lib/campaign-batches/service";
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
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const input = body as { campaignIds?: unknown; name?: unknown };
  const campaignIds = Array.isArray(input?.campaignIds)
    ? input.campaignIds.filter((id): id is string => typeof id === "string")
    : [];
  const name = typeof input?.name === "string" ? input.name : undefined;

  try {
    const result = await createBatchFromCampaigns(supabase, user.id, campaignIds, name);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof CampaignBatchError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Unable to create the delivery batch." }, { status: 500 });
  }
}
