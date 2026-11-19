"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { EditAndResendButton } from "@/components/campaigns/EditAndResendButton";

type CampaignRow = {
  id: string;
  name: string;
  subject: string | null;
  status: string;
  created_at: string;
  cron_armed_at: string | null;
  source_campaign_id: string | null;
};

type ResendDraft = { id: string; armed: boolean };

export function CampaignBatchSelectionTable({
  campaigns,
  activeResendDrafts,
  batchMemberships,
}: {
  campaigns: CampaignRow[];
  activeResendDrafts: Record<string, ResendDraft>;
  batchMemberships: Record<string, string>;
}) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  const eligibleIds = useMemo(
    () =>
      campaigns
        .filter(
          (campaign) =>
            campaign.status === "draft" &&
            !campaign.cron_armed_at &&
            !batchMemberships[campaign.id],
        )
        .map((campaign) => campaign.id),
    [batchMemberships, campaigns],
  );
  const allEligibleSelected =
    eligibleIds.length > 0 &&
    eligibleIds.every((campaignId) => selectedIds.includes(campaignId));

  function toggleCampaign(campaignId: string, checked: boolean) {
    setError("");
    setSelectedIds((current) => {
      if (!checked) return current.filter((id) => id !== campaignId);
      if (current.includes(campaignId)) return current;
      if (current.length >= 10) {
        setError("A delivery batch can contain up to 10 campaigns.");
        return current;
      }
      return [...current, campaignId];
    });
  }

  function toggleAllEligible() {
    setError("");
    setSelectedIds(allEligibleSelected ? [] : eligibleIds.slice(0, 10));
    if (!allEligibleSelected && eligibleIds.length > 10) {
      setError("The first 10 eligible campaigns were selected. A batch can contain up to 10.");
    }
  }

  async function prepareSelected() {
    if (selectedIds.length === 0) {
      setError("Select at least one editable draft campaign.");
      return;
    }

    setWorking(true);
    setError("");
    try {
      const createResponse = await fetch("/api/campaign-batches", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ campaignIds: selectedIds }),
      });
      const created = await createResponse.json();
      if (!createResponse.ok || !created.batchId) {
        setError(created.error || "Unable to create the delivery batch.");
        return;
      }

      const prepareResponse = await fetch(
        `/api/campaign-batches/${created.batchId}/prepare`,
        { method: "POST" },
      );
      if (!prepareResponse.ok && prepareResponse.status !== 207) {
        const prepared = await prepareResponse.json().catch(() => ({}));
        setError(
          prepared.error ||
            "The batch was created, but its campaigns could not be prepared.",
        );
      }

      router.push(`/dashboard/campaign-batches/${created.batchId}`);
      router.refresh();
    } catch {
      setError("Unable to prepare the selected campaigns. Check your connection and try again.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <div>
          <strong className="block text-sm text-white">
            {selectedIds.length} of 10 campaigns selected
          </strong>
          <span className="mt-1 block text-xs text-gray-400">
            Each campaign remains a separate email and will be sent during the same cron run.
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={toggleAllEligible}
            disabled={eligibleIds.length === 0 || working}
            className="campaign-secondary-button"
          >
            {allEligibleSelected ? "Clear selection" : "Select eligible drafts"}
          </button>
          <button
            type="button"
            onClick={() => void prepareSelected()}
            disabled={selectedIds.length === 0 || working}
            className="campaign-primary-button !ml-0"
          >
            {working ? "Preparing selected…" : "Prepare selected for cron"}
          </button>
        </div>
      </div>

      {error ? (
        <p role="alert" className="rounded-lg border border-red-400/30 bg-red-950/30 p-3 text-sm text-red-200">
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-left">
          <thead className="bg-white/[0.05] text-sm text-gray-400">
            <tr>
              <th className="w-14 p-4"><span className="sr-only">Select</span></th>
              <th className="p-4">Campaign Name</th>
              <th className="p-4">Subject</th>
              <th className="p-4">Status</th>
              <th className="p-4">Created</th>
              <th className="p-4">Action</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((campaign) => {
              const batchId = batchMemberships[campaign.id];
              const eligible = campaign.status === "draft" && !campaign.cron_armed_at && !batchId;
              const resendDraft = activeResendDrafts[campaign.id];
              return (
                <tr key={campaign.id} className="border-t border-white/10 transition hover:bg-white/[0.03]">
                  <td className="p-4 align-top">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(campaign.id)}
                      disabled={!eligible || working}
                      onChange={(event) => toggleCampaign(campaign.id, event.target.checked)}
                      aria-label={`Select ${campaign.name} for the delivery batch`}
                      className="h-4 w-4 accent-orange-500 disabled:cursor-not-allowed disabled:opacity-35"
                    />
                  </td>
                  <td className="p-4 font-medium">{campaign.name}</td>
                  <td className="p-4 text-gray-400">{campaign.subject || "No subject"}</td>
                  <td className="p-4 capitalize">{campaign.cron_armed_at ? "Waiting for cron" : campaign.status}</td>
                  <td className="p-4 text-gray-400">{new Date(campaign.created_at).toLocaleDateString("en-PH")}</td>
                  <td className="p-4">
                    <div className="flex min-w-max flex-wrap items-start gap-2">
                      <Link href={`/dashboard/campaigns/${campaign.id}`} className="inline-block whitespace-nowrap rounded-lg border border-white/30 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/[0.06]">
                        Open Campaign
                      </Link>
                      {batchId ? (
                        <Link href={`/dashboard/campaign-batches/${batchId}`} className="inline-block whitespace-nowrap rounded-lg border border-orange-400/40 px-4 py-2 text-sm font-semibold text-orange-200 transition hover:bg-orange-500/10">
                          View delivery batch
                        </Link>
                      ) : null}
                      {(campaign.status === "sent" || campaign.status === "failed") ? (
                        resendDraft ? (
                          <Link href={`/dashboard/campaigns/${resendDraft.id}${resendDraft.armed ? "" : "/edit"}`} className="inline-block whitespace-nowrap rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-600">
                            {resendDraft.armed ? "View resend waiting for cron" : "Continue resend draft"}
                          </Link>
                        ) : (
                          <EditAndResendButton campaignId={campaign.id} compact />
                        )
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
