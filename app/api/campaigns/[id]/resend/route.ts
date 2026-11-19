import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ id: string }> };

type ResendDraftResult = {
  campaign_id: string;
  created: boolean;
  cron_armed_at: string | null;
};

export async function POST(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: "Your session has expired. Please log in again." },
      { status: 401 },
    );
  }

  const { data: sourceCampaign, error: sourceError } = await supabase
    .from("campaigns")
    .select("id, status")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (sourceError) {
    return NextResponse.json(
      { error: "Unable to load this campaign." },
      { status: 500 },
    );
  }

  if (!sourceCampaign) {
    return NextResponse.json(
      { error: "Campaign not found." },
      { status: 404 },
    );
  }

  if (sourceCampaign.status !== "sent" && sourceCampaign.status !== "failed") {
    return NextResponse.json(
      { error: "Only sent or failed campaigns can be edited and resent." },
      { status: 409 },
    );
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("create_or_get_resend_draft", {
      p_source_campaign_id: id,
      p_user_id: user.id,
    });
    const result = (data?.[0] ?? null) as ResendDraftResult | null;

    if (error || !result) {
      return NextResponse.json(
        { error: "Unable to create the resend draft." },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        success: true,
        campaignId: result.campaign_id,
        created: result.created,
        editable: !result.cron_armed_at,
      },
      { status: result.created ? 201 : 200 },
    );
  } catch {
    return NextResponse.json(
      { error: "Unable to create the resend draft." },
      { status: 500 },
    );
  }
}
