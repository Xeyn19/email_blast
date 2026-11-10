
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
    .select("id, status")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !campaign) notFound();

  if (campaign.status !== "draft") {
    redirect(`/dashboard/campaigns/${id}`);
  }

  return (
    <main className="min-h-screen bg-[#0b0b0b] p-6 text-white md:p-10">
      <div className="mx-auto max-w-4xl">
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

<div className="rounded-xl border border-white/10 bg-[#171717] p-6 md:p-8">
          <CampaignForm campaignId={campaign.id} />
        </div>
      </div>
    </main>
  );
}
