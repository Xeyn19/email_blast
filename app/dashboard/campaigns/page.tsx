
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
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

  const { data: campaigns, error } = await supabase
    .from("campaigns")
    .select("*")
    .order("created_at", { ascending: false });

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

        {!error && campaigns && campaigns.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-left">
              <thead className="bg-white/[0.05] text-sm text-gray-400">
                <tr>
                  <th className="p-4">Campaign Name</th>
                  <th className="p-4">Subject</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Created</th>
                  <th className="p-4">Action</th>
                </tr>
              </thead>

              <tbody>
                {campaigns.map((campaign) => (
                  <tr
                    key={campaign.id}
                    className="border-t border-white/10 transition hover:bg-white/[0.03]"
                  >
                    <td className="p-4 font-medium">
                      {campaign.name}
                    </td>

                    <td className="p-4 text-gray-400">
                      {campaign.subject || "No subject"}
                    </td>

                    <td className="p-4 capitalize">
                      {campaign.status}
                    </td>

                    <td className="p-4 text-gray-400">
                      {new Date(
                        campaign.created_at
                      ).toLocaleDateString()}
                    </td>

                    <td className="p-4">
                      <Link
                        href={`/dashboard/campaigns/${campaign.id}`}
                        className="inline-block whitespace-nowrap rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-600"
                      >
                        Open Campaign
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

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
