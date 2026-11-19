
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { CampaignBatchSelectionTable } from "@/components/campaigns/CampaignBatchSelectionTable";
import { createClient } from "@/lib/supabase/server";

export default function CampaignsPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#0b0b0b] p-10 text-white">
          <p className="text-gray-400">Loading campaigns...</p>
        </main>
      }
    >
      <CampaignsContent />
    </Suspense>
  );
}

async function CampaignsContent() {
  await connection();

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const [campaignsResult, batchItemsResult] = await Promise.all([
    supabase
      .from("campaigns")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase
      .from("campaign_batch_items")
      .select("campaign_id, batch_id"),
  ]);
  const { data: campaigns, error } = campaignsResult;
  const batchMemberships = Object.fromEntries(
    (batchItemsResult.data ?? []).map((item) => [item.campaign_id, item.batch_id]),
  );

  const activeResendDraftBySource: Record<string, { id: string; armed: boolean }> = {};
  for (const campaign of campaigns ?? []) {
    if (
      campaign.status === "draft" &&
      campaign.source_campaign_id &&
      !activeResendDraftBySource[campaign.source_campaign_id]
    ) {
      activeResendDraftBySource[campaign.source_campaign_id] = {
        id: campaign.id,
        armed: Boolean(campaign.cron_armed_at),
      };
    }
  }

  return (
    <main className="min-h-screen bg-[#0b0b0b] p-6 text-white md:p-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Campaigns</h1>
            <p className="mt-2 text-gray-400">
              Create and manage your email campaigns.
            </p>
          </div>

          <Link
            href="/dashboard/campaigns/new"
            className="rounded-lg bg-orange-500 px-5 py-3 font-semibold text-white transition hover:bg-orange-600"
          >
            + Create Campaign
          </Link>
        </div>

        {error && (
          <p className="rounded-lg bg-red-500/10 p-4 text-red-400">
            Unable to load campaigns: {error.message}
          </p>
        )}

        {!error && campaigns?.length === 0 && (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-10 text-center">
            <h2 className="text-xl font-semibold">
              No campaigns yet
            </h2>
            <p className="mt-2 text-gray-400">
              Your saved campaigns will appear here.
            </p>
          </div>
        )}

        {!error && campaigns && campaigns.length > 0 ? (
          <CampaignBatchSelectionTable
            campaigns={campaigns.map((campaign) => ({
              id: campaign.id,
              name: campaign.name,
              subject: campaign.subject,
              status: campaign.status,
              created_at: campaign.created_at,
              cron_armed_at: campaign.cron_armed_at,
              source_campaign_id: campaign.source_campaign_id,
            }))}
            activeResendDrafts={activeResendDraftBySource}
            batchMemberships={batchMemberships}
          />
        ) : null}

        <div className="mt-8">
          <Link
            href="/dashboard"
            className="text-sm text-orange-400 hover:text-orange-300"
          >
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
