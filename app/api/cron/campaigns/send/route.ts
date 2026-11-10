import { NextResponse } from "next/server";
import { isValidCronToken } from "@/lib/campaigns/security";
import { CampaignServiceError, sendClaimedCampaign } from "@/lib/campaigns/service";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 25;
const noStoreHeaders = { "Cache-Control": "no-store, max-age=0" };

export async function POST(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, error: "Cron delivery is not configured." }, { status: 500, headers: noStoreHeaders });
  }

  const token = new URL(request.url).searchParams.get("token");
  if (!isValidCronToken(token, process.env.CRON_SECRET)) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401, headers: noStoreHeaders });
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("claim_armed_campaign");
    if (error) return NextResponse.json({ ok: false, error: "Unable to claim the cron campaign." }, { status: 500, headers: noStoreHeaders });

    const campaignId = data?.[0]?.campaign_id as string | undefined;
    if (!campaignId) {
      return NextResponse.json({ ok: true, sent: false, reason: "no_campaign_armed" }, { status: 200, headers: noStoreHeaders });
    }

    try {
      const result = await sendClaimedCampaign(admin, campaignId);
      return NextResponse.json({ ok: true, accepted: true, campaignId: result.campaignId }, { status: 200, headers: noStoreHeaders });
    } catch (serviceError) {
      if (serviceError instanceof CampaignServiceError && serviceError.code === "brevo_send_uncertain") {
        return NextResponse.json({ ok: true, accepted: null, campaignId, status: "delivery_confirmation_uncertain" }, { status: 202, headers: noStoreHeaders });
      }
      return NextResponse.json({ ok: false, accepted: false, campaignId, error: "Brevo rejected the delivery request." }, { status: 502, headers: noStoreHeaders });
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Cron delivery failed unexpectedly." }, { status: 500, headers: noStoreHeaders });
  }
}

