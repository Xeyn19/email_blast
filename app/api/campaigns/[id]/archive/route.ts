import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ id: string }> };
type ArchiveResult = {
  campaign_id: string;
  archived_at: string | null;
};

async function updateArchiveState(
  archive: boolean,
  { params }: RouteContext,
) {
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

  const { data: ownedCampaign, error: ownershipError } = await supabase
    .from("campaigns")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (ownershipError) {
    return NextResponse.json(
      { error: "Unable to load this campaign." },
      { status: 500 },
    );
  }
  if (!ownedCampaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }

  const { data, error } = await createAdminClient().rpc(
    "set_campaign_archived",
    {
      p_campaign_id: id,
      p_user_id: user.id,
      p_archive: archive,
    },
  );
  const result = (data?.[0] ?? null) as ArchiveResult | null;

  if (error?.message?.includes("campaign_archive_active_delivery")) {
    return NextResponse.json(
      {
        error:
          "Remove this campaign from its active delivery batch before archiving it.",
      },
      { status: 409 },
    );
  }
  if (!archive && error?.code === "23505") {
    return NextResponse.json(
      {
        error:
          "This resend draft cannot be restored while another active resend draft exists.",
      },
      { status: 409 },
    );
  }
  if (error || !result) {
    return NextResponse.json(
      {
        error: archive
          ? "Unable to archive this campaign."
          : "Unable to restore this campaign.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    campaignId: result.campaign_id,
    archivedAt: result.archived_at,
    permanentlyDeletesAt: result.archived_at
      ? new Date(
          new Date(result.archived_at).getTime() + 30 * 24 * 60 * 60 * 1000,
        ).toISOString()
      : null,
  });
}

export async function POST(_request: Request, context: RouteContext) {
  return updateArchiveState(true, context);
}

export async function DELETE(_request: Request, context: RouteContext) {
  return updateArchiveState(false, context);
}
