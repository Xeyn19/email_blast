
import { SyncBrevoButton } from "@/components/campaigns/SyncBrevoButton";
import { CreateBrevoCampaignButton } from "@/components/campaigns/CreateBrevoCampaignButton";
import { SendBrevoCampaignButton } from "@/components/campaigns/SendBrevoCampaignButton";
import { CheckBrevoStatusButton } from "@/components/campaigns/CheckBrevoStatusButton";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default function CampaignDetailsPage({ params }: PageProps) {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-gray-400">
          Loading campaign...
        </div>
      }
    >
      <CampaignDetailsContent params={params} />
    </Suspense>
  );
}

async function CampaignDetailsContent({ params }: PageProps) {
  await connection();

  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const { data: campaign, error } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !campaign) notFound();

  const recipientIds = campaign.recipient_contact_ids ?? [];

  let recipients: {
    id: string;
    full_name: string | null;
    email: string;
    status: string;
  }[] = [];

  if (recipientIds.length > 0) {
    const { data } = await supabase
      .from("contacts")
      .select("id, full_name, email, status")
      .in("id", recipientIds);

    recipients = data ?? [];
  }

  return (
    <div className="min-h-screen bg-[#0b0b0b] p-6 text-white md:p-10">
      <div className="mx-auto max-w-5xl space-y-8">

        {/* Campaign Header */}
        <div>
          <Link
            href="/dashboard/campaigns"
            className="text-sm font-medium text-orange-400 hover:text-orange-300"
          >
            ← Back to Campaigns
          </Link>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-white">
                {campaign.name}
              </h1>
              <p className="mt-2 text-sm text-gray-400">
                Campaign details and recipients
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {campaign.status === "draft" && (
                <Link
                  href={`/dashboard/campaigns/${campaign.id}/edit`}
                  className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-600"
                >
                  Edit Draft
                </Link>
              )}

              <span className="rounded-full border border-orange-500/20 bg-orange-500/10 px-4 py-2 text-sm font-semibold capitalize text-orange-400">
                {campaign.status}
              </span>
            </div>
          </div>
        </div>

        {/* Campaign Information */}
        <section className="rounded-xl border border-white/10 bg-[#171717] p-6">
          <h2 className="mb-5 text-lg font-bold text-white">
            Campaign Information
          </h2>

          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-400">Campaign Name</p>
              <p className="font-medium text-white">{campaign.name}</p>
            </div>

            <div>
              <p className="text-sm text-gray-400">Email Subject</p>
              <p className="font-medium text-white">
                {campaign.subject || "No subject"}
              </p>
            </div>

            <div>
              <p className="text-sm text-gray-400">Preview Text</p>
              <p className="font-medium text-white">
                {campaign.preview_text || "No preview text"}
              </p>
            </div>

            <div>
              <p className="text-sm text-gray-400">Created</p>
              <p className="font-medium text-white">
                {new Date(campaign.created_at).toLocaleString()}
              </p>
            </div>
          </div>
        </section>

        {/* Selected Recipients */}
        <section className="rounded-xl border border-white/10 bg-[#171717] p-6">
          <h2 className="mb-2 text-lg font-bold text-white">
            Selected Recipients
          </h2>

          <p className="mb-5 text-sm text-gray-400">
            {recipientIds.length} selected contact(s)
          </p>

          {recipients.length === 0 ? (
            <p className="text-sm text-gray-400">
              No recipients were found for this campaign.
            </p>
          ) : (
            <div className="divide-y divide-white/10">
              {recipients.map((contact) => (
                <div
                  key={contact.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div>
                    <p className="font-medium text-white">
                      {contact.full_name || "Unnamed Contact"}
                    </p>
                    <p className="text-sm text-gray-400">
                      {contact.email}
                    </p>
                  </div>

                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium capitalize text-gray-300">
                    {contact.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Email Content */}
        <section className="rounded-xl border border-white/10 bg-[#171717] p-6">
          <h2 className="mb-4 text-lg font-bold text-white">
            Email Content
          </h2>

          <iframe
            title="Campaign email preview"
            sandbox=""
            srcDoc={campaign.html_content || "<p>No email content.</p>"}
            className="min-h-[350px] w-full rounded-lg border border-white/10 bg-white"
          />
        </section>

        {/* Brevo Actions */}
        <section className="rounded-xl border border-white/10 bg-[#171717] p-6">
          <h2 className="mb-4 text-lg font-bold text-white">
            Brevo Campaign Actions
          </h2>

          <div className="flex flex-wrap justify-end gap-3">
            <SyncBrevoButton campaignId={campaign.id} />

            <CreateBrevoCampaignButton
              campaignId={campaign.id}
              canCreate={
                campaign.status === "draft" &&
                Boolean(campaign.brevo_synced_at) &&
                !campaign.brevo_campaign_id
              }
            />

            <SendBrevoCampaignButton
              campaignId={campaign.id}
              canSend={
                campaign.status === "draft" &&
                Boolean(campaign.brevo_synced_at) &&
                Boolean(campaign.brevo_campaign_id)
              }
            />

            <CheckBrevoStatusButton
              campaignId={campaign.id}
              canCheck={Boolean(campaign.brevo_campaign_id)}
            />
          </div>
        </section>

      </div>
    </div>
  );
}
