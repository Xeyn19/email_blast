import { NextResponse } from "next/server";
import { runBatchWithConcurrency } from "@/lib/campaign-batches/execution";
import {
  CampaignServiceError,
  reconcileCampaignStatus,
  refreshBatchAggregate,
} from "@/lib/campaigns/service";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Your session has expired. Please log in again." }, { status: 401 });
  }

  let [{ data: batch, error: batchError }, { data: items, error: itemsError }] = await Promise.all([
    supabase
      .from("campaign_batches")
      .select("id, name, status, prepared_at, armed_at, claimed_at, completed_at, last_error")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("campaign_batch_items")
      .select("campaign_id, position, preparation_status, last_error, prepared_at, campaigns!inner(user_id, name, subject, status, recipient_contact_ids, cron_armed_at)")
      .eq("batch_id", id)
      .eq("campaigns.user_id", user.id)
      .order("position"),
  ]);

  if (batchError || itemsError) {
    return NextResponse.json({ error: "Unable to load the delivery batch." }, { status: 500 });
  }
  if (!batch) {
    return NextResponse.json({ error: "Delivery batch not found." }, { status: 404 });
  }

  if (batch.status === "sending") {
    const sendingCampaignIds = (items ?? []).flatMap((item) => {
      const campaignValue = Array.isArray(item.campaigns)
        ? item.campaigns[0]
        : item.campaigns;
      const campaign = campaignValue as { status?: string } | null;
      return campaign?.status === "sending" ? [item.campaign_id as string] : [];
    });

    try {
      const admin = createAdminClient();
      if (sendingCampaignIds.length > 0) {
        await runBatchWithConcurrency(
          sendingCampaignIds,
          3,
          (campaignId) =>
            reconcileCampaignStatus(admin, campaignId, user.id, 5_000),
        );
      }

      // Recalculate even when no campaigns remain in `sending`. That is the
      // transition that closes a fully sent batch.
      await refreshBatchAggregate(admin, id);

      const refreshed = await Promise.all([
        supabase
          .from("campaign_batches")
          .select("id, name, status, prepared_at, armed_at, claimed_at, completed_at, last_error")
          .eq("id", id)
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("campaign_batch_items")
          .select("campaign_id, position, preparation_status, last_error, prepared_at, campaigns!inner(user_id, name, subject, status, recipient_contact_ids, cron_armed_at)")
          .eq("batch_id", id)
          .eq("campaigns.user_id", user.id)
          .order("position"),
      ]);
      batch = refreshed[0].data;
      items = refreshed[1].data;
      batchError = refreshed[0].error;
      itemsError = refreshed[1].error;

      if (batchError || itemsError || !batch) {
        return NextResponse.json(
          { error: "Unable to refresh the delivery batch." },
          { status: 500 },
        );
      }
    } catch (error) {
      const message =
        error instanceof CampaignServiceError
          ? error.message
          : "Unable to refresh the delivery batch.";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  return NextResponse.json({
    batch: {
      id: batch.id,
      name: batch.name,
      status: batch.status,
      preparedAt: batch.prepared_at,
      armedAt: batch.armed_at,
      claimedAt: batch.claimed_at,
      completedAt: batch.completed_at,
      lastError: batch.last_error,
      items: (items ?? []).map((item) => {
        const campaignValue = Array.isArray(item.campaigns) ? item.campaigns[0] : item.campaigns;
        const campaign = campaignValue as {
          name: string;
          subject: string;
          status: string;
          recipient_contact_ids: string[] | null;
          cron_armed_at: string | null;
        };
        return {
          campaignId: item.campaign_id,
          position: item.position,
          preparationStatus: item.preparation_status,
          lastError: item.last_error,
          preparedAt: item.prepared_at,
          campaign: {
            name: campaign.name,
            subject: campaign.subject,
            status: campaign.status,
            recipientCount: campaign.recipient_contact_ids?.length ?? 0,
            cronArmedAt: campaign.cron_armed_at,
          },
        };
      }),
    },
  });
}
