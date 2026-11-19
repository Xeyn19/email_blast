import { NextResponse } from "next/server";
import { isValidCronToken } from "@/lib/campaigns/security";
import {
  CampaignServiceError,
  refreshBatchAggregate,
  sendClaimedCampaign,
} from "@/lib/campaigns/service";
import { runBatchWithConcurrency } from "@/lib/campaign-batches/execution";
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
    const { data, error } = await admin.rpc("claim_armed_campaign_batch");
    if (error) return NextResponse.json({ ok: false, error: "Unable to claim the delivery batch." }, { status: 500, headers: noStoreHeaders });

    const claimed = data?.[0] as { batch_id?: string; campaign_ids?: string[] } | undefined;
    const batchId = claimed?.batch_id;
    const campaignIds = claimed?.campaign_ids ?? [];
    if (!batchId || campaignIds.length === 0) {
      return NextResponse.json({ ok: true, sent: false, reason: "no_batch_armed" }, { status: 200, headers: noStoreHeaders });
    }

    const settled = await runBatchWithConcurrency(
      campaignIds.slice(0, 10),
      3,
      // Four waves of at most five seconds keep the 10-campaign batch inside
      // the route's 25-second execution limit. A timeout stays uncertain and
      // is reconciled with Brevo instead of being retried automatically.
      (campaignId) => sendClaimedCampaign(admin, campaignId, 5_000),
    );
    const results = settled.map((result) => ({
      campaignId: result.id,
      outcome: result.status === "fulfilled"
        ? "accepted" as const
        : result.reason instanceof CampaignServiceError && result.reason.code === "brevo_send_uncertain"
          ? "uncertain" as const
          : "rejected" as const,
    }));
    await refreshBatchAggregate(admin, batchId);
    const accepted = results.filter((result) => result.outcome === "accepted").length;
    const rejected = results.filter((result) => result.outcome === "rejected").length;
    const uncertain = results.filter((result) => result.outcome === "uncertain").length;
    return NextResponse.json({
      ok: true,
      sent: true,
      batchId,
      campaignCount: results.length,
      accepted,
      rejected,
      uncertain,
    }, { status: uncertain ? 202 : 200, headers: noStoreHeaders });
  } catch {
    return NextResponse.json({ ok: false, error: "Cron delivery failed unexpectedly." }, { status: 500, headers: noStoreHeaders });
  }
}

