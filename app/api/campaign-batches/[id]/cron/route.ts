import { NextResponse } from "next/server";
import { armBatch, CampaignBatchError, disarmBatch } from "@/lib/campaign-batches/service";
import { createClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ id: string }> };

async function getUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  return { user, error };
}

export async function POST(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const { user, error: authError } = await getUser();
  if (authError || !user) return NextResponse.json({ error: "Your session has expired. Please log in again." }, { status: 401 });
  try {
    return NextResponse.json(await armBatch(id, user.id));
  } catch (error) {
    if (error instanceof CampaignBatchError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Unable to add this delivery batch to cron." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const { user, error: authError } = await getUser();
  if (authError || !user) return NextResponse.json({ error: "Your session has expired. Please log in again." }, { status: 401 });
  try {
    return NextResponse.json(await disarmBatch(id, user.id));
  } catch (error) {
    if (error instanceof CampaignBatchError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Unable to remove this delivery batch from cron." }, { status: 500 });
  }
}
