
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
    <main className="min-h-screen bg-[#0b0b0b] p-5 text-white md:p-8 lg:p-10">
      <div className="mx-auto max-w-7xl">
        <Link
          href="/dashboard/campaigns"
          className="text-sm text-orange-400 hover:text-orange-300"
        >
          ← Back to Campaigns
        </Link>

        <div className="mb-6 mt-5">
          <h1 className="text-3xl font-bold md:text-4xl">Create campaign</h1>
          <p className="mt-2 text-gray-400">
            Compose your email, choose your audience, and decide when to deliver it.
          </p>
        </div>
        <CampaignForm />
      </div>
    </main>
  );
}
