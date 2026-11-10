
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { CampaignForm } from "@/components/campaigns/CampaignForm";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default function EditCampaignPage({ params }: PageProps) {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#0b0b0b] p-10 text-white">
          <p className="text-gray-400">Loading draft...</p>
        </main>
      }
    >
      <EditCampaignContent params={params} />
    </Suspense>
  );
}

async function EditCampaignContent({ params }: PageProps) {
  await connection();

  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const { data: campaign, error } = await supabase
    .from("campaigns")
    .select("id, status, cron_armed_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !campaign) notFound();

  if (campaign.status !== "draft" || campaign.cron_armed_at) {
    redirect(`/dashboard/campaigns/${id}`);
  }

  return (
    <main className="min-h-screen bg-[#0b0b0b] p-6 text-white md:p-10">
      <div className="mx-auto max-w-7xl">
        <Link
          href={`/dashboard/campaigns/${id}`}
          className="text-sm text-orange-400 hover:text-orange-300"
        >
          ← Back to Campaign
        </Link>

        <div className="mb-8 mt-6">
          <h1 className="text-3xl font-bold">Edit Campaign Draft</h1>
          <p className="mt-2 text-gray-400">
            Update your campaign details, recipients, and email content.
          </p>
        </div>

        <CampaignForm campaignId={campaign.id} />
      </div>
    </main>
  );
}
