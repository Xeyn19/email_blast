import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { CampaignBatchReview } from "@/components/campaigns/CampaignBatchReview";
import { createClient } from "@/lib/supabase/server";

type PageProps = { params: Promise<{ id: string }> };

export default async function CampaignBatchPage({ params }: PageProps) {
  await connection();
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  return (
    <main className="min-h-screen bg-[#0b0b0b] p-5 text-white md:p-8 lg:p-10">
      <div className="mx-auto max-w-7xl">
        <Link href="/dashboard/campaigns" className="text-sm text-gray-300 transition hover:text-white">← Back to campaigns</Link>
        <div className="mt-5">
          <CampaignBatchReview batchId={id} />
        </div>
      </div>
    </main>
  );
}
