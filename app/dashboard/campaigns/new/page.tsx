
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { CampaignForm } from "../../../../components/campaigns/CampaignForm";

export default function NewCampaignPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#0b0b0b] p-10 text-white">
          <p className="text-gray-400">Loading campaign form...</p>
        </main>
      }
    >
      <NewCampaignContent />
    </Suspense>
  );
}

async function NewCampaignContent() {
  await connection();

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  return (
    <main className="min-h-screen bg-[#0b0b0b] p-6 text-white md:p-10">
      <div className="mx-auto max-w-4xl">
        <Link
          href="/dashboard/campaigns"
          className="text-sm text-orange-400 hover:text-orange-300"
        >
          ← Back to Campaigns
        </Link>

        <div className="mb-8 mt-6">
          <h1 className="text-3xl font-bold">
            Create a Campaign
          </h1>
          <p className="mt-2 text-gray-400">
            Prepare your email campaign and save it as a draft.
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 md:p-8">
          <CampaignForm />
        </div>
      </div>
    </main>
  );
}
