import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { CampaignCronControls } from "@/components/campaigns/CampaignCronControls";
import { EditAndResendButton } from "@/components/campaigns/EditAndResendButton";
import { CampaignStatusPoller } from "@/components/campaigns/CampaignStatusPoller";
import { campaignUsesRecipientPersonalization } from "@/lib/campaigns/personalization";
import { renderRecipientPreview } from "@/lib/email-templates/tokens";
import { createClient } from "@/lib/supabase/server";

type PageProps = { params: Promise<{ id: string }> };

export default function CampaignDetailsPage({ params }: PageProps) {
  return <Suspense fallback={<div className="p-8 text-gray-400">Loading campaign…</div>}><CampaignDetailsContent params={params} /></Suspense>;
}

async function CampaignDetailsContent({ params }: PageProps) {
  await connection();
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: campaign, error } = await supabase.from("campaigns").select("*").eq("id", id).eq("user_id", user.id).single();
  if (error || !campaign) notFound();

  const recipientIds: string[] = campaign.recipient_contact_ids ?? [];
  const [recipientsResult, sourceCampaignResult, activeResendResult, batchMembershipResult] = await Promise.all([
    recipientIds.length
      ? supabase.from("contacts").select("id, full_name, company, email, status").eq("user_id", user.id).in("id", recipientIds)
      : Promise.resolve({ data: [] }),
    campaign.source_campaign_id
      ? supabase.from("campaigns").select("id, name").eq("id", campaign.source_campaign_id).eq("user_id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    campaign.status === "sent" || campaign.status === "failed"
      ? supabase.from("campaigns").select("id, name, cron_armed_at").eq("source_campaign_id", campaign.id).eq("user_id", user.id).eq("status", "draft").maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("campaign_batch_items")
      .select("batch_id, campaign_batches!inner(id, name, status, armed_at)")
      .eq("campaign_id", campaign.id)
      .maybeSingle(),
  ]);
  const recipients = recipientsResult.data;
  const sourceCampaign = sourceCampaignResult.data;
  const activeResendDraft = activeResendResult.data;
  const batchMembership = batchMembershipResult.data as unknown as {
    batch_id: string;
    campaign_batches: { id: string; name: string; status: string; armed_at: string | null };
  } | null;
  const deliveryBatch = batchMembership?.campaign_batches ?? null;

  const armed = Boolean(campaign.cron_armed_at);
  const prepared = Boolean(campaign.brevo_synced_at && campaign.brevo_list_id && campaign.brevo_campaign_id);
  const statusLabel = armed ? "Waiting for cron" : campaign.status === "failed" ? "Needs attention" : campaign.status === "sending" ? "Sending" : campaign.status === "sent" ? "Sent" : prepared ? "Prepared" : "Draft";
  const preparedAt = campaign.cron_armed_at || campaign.brevo_synced_at;
  const previewRecipient = recipients?.[0];
  const previewRecipientName =
    previewRecipient?.full_name?.trim() ||
    previewRecipient?.company?.trim() ||
    previewRecipient?.email ||
    "Valued Partner";
  const usesRecipientPersonalization =
    campaign.message_mode === "template" &&
    campaignUsesRecipientPersonalization(campaign.html_content);
  const previewHtml =
    campaign.message_mode === "template"
      ? renderRecipientPreview(campaign.html_content, previewRecipientName)
      : campaign.html_content;

  return (
    <main className="min-h-screen bg-[#0b0b0b] p-5 text-white md:p-8 lg:p-10">
      <div className="mx-auto max-w-7xl">
        <Link href="/dashboard/campaigns" className="text-sm text-gray-300 transition hover:text-white">← Back to campaigns</Link>

        <header className="campaign-detail-header">
          <div>
            <h1>{campaign.name}</h1>
            <p>Campaign details and delivery status.</p>
            {sourceCampaign ? (
              <p className="!mt-2 text-sm text-orange-200">
                Created from <Link href={`/dashboard/campaigns/${sourceCampaign.id}`} className="font-semibold underline underline-offset-2">{sourceCampaign.name}</Link>.
              </p>
            ) : null}
            {deliveryBatch ? (
              <p className="!mt-2 text-sm text-gray-300">
                Delivery batch: <Link href={`/dashboard/campaign-batches/${deliveryBatch.id}`} className="font-semibold text-orange-200 underline underline-offset-2">{deliveryBatch.name}</Link>
              </p>
            ) : null}
          </div>
          <span className={`campaign-detail-status status-${campaign.status}`}>{statusLabel}</span>
          <div className="ml-auto flex flex-wrap items-start gap-3 max-sm:ml-0 max-sm:w-full">
            {campaign.status === "draft" && !armed ? <Link href={`/dashboard/campaigns/${campaign.id}/edit`} className="campaign-secondary-button max-sm:w-full max-sm:text-center">Edit campaign</Link> : null}
            {campaign.status === "sent" ? (
              activeResendDraft ? (
                <Link href={`/dashboard/campaigns/${activeResendDraft.id}${activeResendDraft.cron_armed_at ? "" : "/edit"}`} className="campaign-primary-button !ml-0 max-sm:w-full max-sm:text-center">{activeResendDraft.cron_armed_at ? "View resend waiting for cron" : "Continue resend draft"}</Link>
              ) : (
                <EditAndResendButton campaignId={campaign.id} />
              )
            ) : null}
          </div>
        </header>

        {armed ? (
          <section className="armed-campaign-panel">
            <div className="armed-campaign-main">
              <div className="armed-icon" aria-hidden="true">◷</div>
              <div><h2>Ready in a delivery batch</h2><p>This campaign is prepared and waiting with its batch. Your existing cron-job.org schedule will trigger delivery.</p><div className="armed-meta"><span>{recipientIds.length} recipients</span><span>Prepared {formatManilaDate(preparedAt)}</span></div></div>
              <CampaignCronControls campaignId={campaign.id} armed canPrepare={false} inBatch={Boolean(deliveryBatch)} />
            </div>
            <div className="armed-notice">ⓘ The email has not been sent yet.</div>
          </section>
        ) : campaign.status === "draft" ? (
          <section className="armed-campaign-panel">
            <div className="armed-campaign-main">
              <div className="armed-icon" aria-hidden="true">✓</div>
              <div>
                <h2>{deliveryBatch ? "Continue with the delivery batch" : prepared ? "Campaign prepared" : "Draft campaign"}</h2>
                <p>{deliveryBatch ? `This email is already grouped in “${deliveryBatch.name}”. Prepare and add all campaigns to cron from the batch review page.` : prepared ? "The Brevo draft is ready. Continue to the delivery batch for the next cron run." : "Review the campaign, then prepare it as a one-email delivery batch or combine it with other drafts."}</p>
              </div>
              {deliveryBatch ? (
                <Link href={`/dashboard/campaign-batches/${deliveryBatch.id}`} className="campaign-primary-button !ml-0">Continue delivery batch</Link>
              ) : (
                <CampaignCronControls campaignId={campaign.id} armed={false} canPrepare />
              )}
            </div>
          </section>
        ) : null}

        {campaign.status === "failed" && <section className="campaign-failure-panel"><div><h2>Delivery needs attention</h2><p>{campaign.last_error || "Brevo could not complete this delivery. Create an editable resend draft to review the campaign before another attempt."}</p></div>{activeResendDraft ? <Link href={`/dashboard/campaigns/${activeResendDraft.id}${activeResendDraft.cron_armed_at ? "" : "/edit"}`} className="campaign-primary-button !ml-0">{activeResendDraft.cron_armed_at ? "View resend waiting for cron" : "Continue resend draft"}</Link> : <EditAndResendButton campaignId={campaign.id} />}</section>}

        <CampaignLifecycle status={campaign.status} armed={armed} prepared={prepared} />
        <CampaignStatusPoller campaignId={campaign.id} active={campaign.status === "sending"} />

        <section className="campaign-detail-section">
          <div className="campaign-detail-section-heading"><span>1</span><div><h2>Email preview</h2><p>See the email content that will be sent to your audience.</p></div></div>
          {usesRecipientPersonalization ? (
            <p className="mb-3 text-sm text-gray-400">Previewing the personalized greeting as <strong className="text-white">{previewRecipientName}</strong>. Brevo will use each recipient’s own name when sending.</p>
          ) : campaign.message_mode === "template" ? (
            <p className="mb-3 text-sm text-gray-400">This template does not include recipient-name personalization. Its HTML will be sent unchanged.</p>
          ) : null}
          <iframe title="Campaign email preview" sandbox="" srcDoc={previewHtml || "<p>No email content.</p>"} className="min-h-[360px] w-full rounded-xl border border-white/10 bg-white" />
        </section>

        <section className="campaign-detail-section">
          <div className="campaign-detail-section-heading"><span>2</span><div><h2>Audience summary</h2><p>The subscribed recipients who will receive this campaign.</p></div></div>
          <div className="detail-list"><strong>{recipientIds.length} recipients</strong>{(recipients ?? []).slice(0, 5).map((contact) => <div key={contact.id}><span>{contact.full_name || contact.company || "Unnamed contact"}</span><small>{contact.email}</small></div>)}</div>
        </section>

        <section className="campaign-detail-section">
          <div className="campaign-detail-section-heading"><span>3</span><div><h2>Campaign details</h2><p>Core information about this campaign.</p></div></div>
          <dl className="campaign-detail-grid"><div><dt>Campaign name</dt><dd>{campaign.name}</dd></div><div><dt>Email subject</dt><dd>{campaign.subject}</dd></div><div><dt>Message type</dt><dd>{campaign.message_mode === "template" ? "HTML template" : "Manual text"}</dd></div><div><dt>Preview text</dt><dd>{campaign.preview_text || "No preview text"}</dd></div><div><dt>Created</dt><dd>{formatManilaDate(campaign.created_at)}</dd></div></dl>
        </section>

        <details className="technical-details"><summary><span>4</span><strong>Technical details</strong><small>System information for troubleshooting and support.</small></summary><dl><div><dt>Brevo list</dt><dd>{campaign.brevo_list_id || "Not prepared"}</dd></div><div><dt>Brevo campaign</dt><dd>{campaign.brevo_campaign_id || "Not prepared"}</dd></div><div><dt>Last status check</dt><dd>{formatManilaDate(campaign.status_checked_at)}</dd></div></dl></details>
      </div>
    </main>
  );
}

function CampaignLifecycle({ status, armed, prepared }: { status: string; armed: boolean; prepared: boolean }) {
  const current = status === "sent" ? 4 : status === "sending" ? 3 : armed ? 2 : prepared ? 1 : 0;
  const steps = ["Draft", "Prepared", "Waiting for cron", "Sending", "Sent"];
  return <ol className="campaign-lifecycle" aria-label="Campaign delivery progress">{steps.map((step, index) => <li key={step} className={index < current ? "complete" : index === current ? "current" : ""}><span>{index < current ? "✓" : index + 1}</span><strong>{step}</strong></li>)}</ol>;
}

function formatManilaDate(value: string | null | undefined) {
  if (!value) return "Not available";
  return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" }).format(new Date(value));
}
