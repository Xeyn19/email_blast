import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  DashboardOverview,
  DashboardOverviewSkeleton,
  type RecentOverviewCampaign,
} from "@/components/dashboard/dashboard-overview";
import type { CampaignDeliveryMembership } from "@/lib/campaigns/dashboard";
import {
  buildAudienceHealth,
  buildOverviewMetrics,
  selectDeliveryOverview,
  type OverviewBatch,
} from "@/lib/dashboard/overview";
import DashboardClient from "./dashboard-client";

export default function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  return (
    <Suspense fallback={<DashboardOverviewSkeleton />}>
      <DashboardContent searchParams={searchParams} />
    </Suspense>
  );
}

async function DashboardContent({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  await connection();

  const params = await searchParams;
  const initialView = params.view === "contacts" ? "Contacts" : "Overview";

  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/");
  }

  const fullName =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name
      : "";

  const name = fullName || user.email || "User";

  if (initialView === "Contacts") {
    return (
      <DashboardClient
        user={{ name, email: user.email ?? "" }}
        initialView="Contacts"
      />
    );
  }

  const [
    recentResult,
    activeCountResult,
    waitingCountResult,
    sentCountResult,
    failedCountResult,
    subscribedCountResult,
    pendingCountResult,
    unsubscribedCountResult,
    batchesResult,
  ] = await Promise.all([
    supabase
      .from("campaigns")
      .select(
        "id, name, status, created_at, updated_at, cron_armed_at, recipient_contact_ids",
      )
      .eq("user_id", user.id)
      .is("archived_at", null)
      .order("updated_at", { ascending: false })
      .limit(5),
    supabase
      .from("campaigns")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("archived_at", null)
      .in("status", ["draft", "sending", "failed"]),
    supabase
      .from("campaigns")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("archived_at", null)
      .eq("status", "draft")
      .not("cron_armed_at", "is", null),
    supabase
      .from("campaigns")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("archived_at", null)
      .eq("status", "sent"),
    supabase
      .from("campaigns")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("archived_at", null)
      .eq("status", "failed"),
    supabase
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "subscribed"),
    supabase
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "pending"),
    supabase
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "unsubscribed"),
    supabase
      .from("campaign_batches")
      .select(
        "id, name, status, campaign_batch_items(campaign_id, campaigns(status))",
      )
      .eq("user_id", user.id)
      .in("status", ["preparing", "prepared", "waiting", "sending"])
      .order("updated_at", { ascending: false })
      .limit(20),
  ]);

  const recentRows = recentResult.data ?? [];
  const recentIds = recentRows.map((campaign) => campaign.id as string);
  const membershipsResult = recentIds.length
    ? await supabase
        .from("campaign_batch_items")
        .select(
          "campaign_id, preparation_status, campaign_batches!inner(id, name, status, user_id)",
        )
        .in("campaign_id", recentIds)
        .eq("campaign_batches.user_id", user.id)
    : { data: [], error: null };

  const memberships: Record<string, CampaignDeliveryMembership> = {};
  for (const item of membershipsResult.data ?? []) {
    const batch = firstRelation(item.campaign_batches) as {
      id?: string;
      name?: string;
      status?: string;
    } | null;
    if (!batch?.id || !batch.name || !batch.status) continue;
    memberships[item.campaign_id as string] = {
      batchId: batch.id,
      batchName: batch.name,
      batchStatus: batch.status,
      preparationStatus: String(item.preparation_status ?? "pending"),
    };
  }

  const recentCampaigns: RecentOverviewCampaign[] = recentRows.map((campaign) => ({
    id: campaign.id as string,
    name: campaign.name as string,
    status: campaign.status as string,
    cronArmedAt: (campaign.cron_armed_at as string | null) ?? null,
    recipientCount: Array.isArray(campaign.recipient_contact_ids)
      ? campaign.recipient_contact_ids.length
      : 0,
    updatedAt: String(campaign.updated_at || campaign.created_at),
  }));

  const batches: OverviewBatch[] = (batchesResult.data ?? []).map((batch) => {
    const items = Array.isArray(batch.campaign_batch_items)
      ? batch.campaign_batch_items
      : [];
    const sentCount = items.filter((item) => {
      const campaign = firstRelation(item.campaigns) as { status?: string } | null;
      return campaign?.status === "sent";
    }).length;
    return {
      id: batch.id as string,
      name: batch.name as string,
      status: batch.status as string,
      campaignCount: items.length,
      sentCount,
    };
  });

  const dataWarning = Boolean(
    recentResult.error ||
      activeCountResult.error ||
      waitingCountResult.error ||
      sentCountResult.error ||
      failedCountResult.error ||
      subscribedCountResult.error ||
      pendingCountResult.error ||
      unsubscribedCountResult.error ||
      batchesResult.error ||
      membershipsResult.error,
  );

  return (
    <DashboardOverview
      userName={name}
      metrics={buildOverviewMetrics({
        active: activeCountResult.count ?? 0,
        waiting: waitingCountResult.count ?? 0,
        sent: sentCountResult.count ?? 0,
        failed: failedCountResult.count ?? 0,
      })}
      audience={buildAudienceHealth({
        subscribed: subscribedCountResult.count ?? 0,
        pending: pendingCountResult.count ?? 0,
        unsubscribed: unsubscribedCountResult.count ?? 0,
      })}
      delivery={selectDeliveryOverview(batches, Boolean(batchesResult.error))}
      recentCampaigns={recentCampaigns}
      memberships={memberships}
      dataWarning={dataWarning}
    />
  );
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}
