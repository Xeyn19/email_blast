import { NextResponse } from "next/server";
import { CampaignBatchError, prepareBatch } from "@/lib/campaign-batches/service";
import { createClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Your session has expired. Please log in again." }, { status: 401 });
  try {
    const result = await prepareBatch(supabase, id, user.id);
    return NextResponse.json(result, {
      status: result.failedCount > 0 ? 207 : 200,
    });
  } catch (error) {
    if (error instanceof CampaignBatchError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Unable to prepare the delivery batch." }, { status: 500 });
  }
}
