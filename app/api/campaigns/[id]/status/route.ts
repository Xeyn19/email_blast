import { NextResponse } from "next/server";
import { CampaignServiceError, reconcileCampaignStatus } from "@/lib/campaigns/service";
import { createClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Your session has expired. Please log in again." }, { status: 401 });

  try {
    return NextResponse.json(await reconcileCampaignStatus(supabase, id, user.id));
  } catch (serviceError) {
    if (serviceError instanceof CampaignServiceError) {
      return NextResponse.json({ error: serviceError.message, code: serviceError.code }, { status: serviceError.status });
    }
    return NextResponse.json({ error: "Unable to check the delivery status." }, { status: 500 });
  }
}

