"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { EditAndResendButton } from "@/components/campaigns/EditAndResendButton";
import { CampaignArchiveButton } from "@/components/campaigns/CampaignArchiveButton";
import {
  getCampaignPrimaryAction,
  getEligibleBatchCampaignIds,
  getCampaignDisplayStatus,
  retainEligibleBatchSelection,
  type CampaignDeliveryMembership,
  type CampaignDisplayStatus,
} from "@/lib/campaigns/dashboard";

export type CampaignDashboardRow = {
  id: string;
  name: string;
  subject: string | null;
  status: string;
  created_at: string;
  cron_armed_at: string | null;
  source_campaign_id: string | null;
  archived_at: string | null;
};

type ResendDraft = { id: string; armed: boolean };

export function CampaignBatchSelectionTable({
  campaigns,
  activeResendDrafts,
  batchMemberships,
  archiveView = false,
}: {
  campaigns: CampaignDashboardRow[];
  activeResendDrafts: Record<string, ResendDraft>;
  batchMemberships: Record<string, CampaignDeliveryMembership>;
  archiveView?: boolean;
}) {
  const router = useRouter();
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  const eligibleIds = useMemo(
    () => getEligibleBatchCampaignIds(
      campaigns.map((campaign) => ({
        id: campaign.id,
        status: campaign.status,
        cronArmedAt: campaign.cron_armed_at,
      })),
      batchMemberships,
    ),
    [batchMemberships, campaigns],
  );
  const validSelectedIds = useMemo(
    () => retainEligibleBatchSelection(selectedIds, eligibleIds),
    [eligibleIds, selectedIds],
  );
  const allEligibleSelected =
    eligibleIds.length > 0 &&
    eligibleIds.every((campaignId) => validSelectedIds.includes(campaignId));

  function closeSelectionMode() {
    setSelectionMode(false);
    setSelectedIds([]);
    setError("");
  }

  function toggleCampaign(campaignId: string, checked: boolean) {
    setError("");
    setSelectedIds((current) => {
      const eligibleSelection = retainEligibleBatchSelection(current, eligibleIds);
      if (!checked) return eligibleSelection.filter((id) => id !== campaignId);
      if (eligibleSelection.includes(campaignId)) return eligibleSelection;
      if (eligibleSelection.length >= 10) {
        setError("A delivery batch can contain up to 10 campaigns.");
        return eligibleSelection;
      }
      return [...eligibleSelection, campaignId];
    });
  }

  function toggleAllEligible() {
    setError("");
    setSelectedIds(allEligibleSelected ? [] : eligibleIds.slice(0, 10));
    if (!allEligibleSelected && eligibleIds.length > 10) {
      setError(
        "The first 10 available drafts were selected. A batch can contain up to 10 campaigns.",
      );
    }
  }

  async function prepareSelected() {
    if (validSelectedIds.length === 0) {
      setError("Select at least one editable draft campaign.");
      return;
    }

    setWorking(true);
    setError("");
    try {
      const createResponse = await fetch("/api/campaign-batches", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ campaignIds: validSelectedIds }),
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
      setError(
        "Unable to prepare the selected campaigns. Check your connection and try again.",
      );
    } finally {
      setWorking(false);
    }
  }

  if (campaigns.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-10 text-center">
        <h2 className="text-lg font-semibold text-white">No campaigns found</h2>
        <p className="mt-2 text-sm text-gray-400">
          Try another status or search term, or create a new campaign.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!archiveView ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <div>
          <strong className="block text-sm text-white">
            {selectionMode
              ? `${validSelectedIds.length} of 10 drafts selected`
              : "Campaign actions"}
          </strong>
          <span className="mt-1 block text-xs text-gray-400">
            {selectionMode
              ? "Select independent draft emails to prepare in one delivery batch."
              : "Create a campaign, or prepare several available drafts together."}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {selectionMode ? (
            <>
              <button
                type="button"
                onClick={toggleAllEligible}
                disabled={eligibleIds.length === 0 || working}
                className="campaign-secondary-button"
              >
                {allEligibleSelected ? "Clear selection" : "Select available drafts"}
              </button>
              <button
                type="button"
                onClick={closeSelectionMode}
                disabled={working}
                className="campaign-secondary-button"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void prepareSelected()}
                disabled={validSelectedIds.length === 0 || working}
                className="campaign-primary-button !ml-0"
              >
                {working
                  ? "Creating delivery batch…"
                  : `Create batch (${validSelectedIds.length})`}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setSelectionMode(true)}
              disabled={eligibleIds.length === 0}
              className="campaign-secondary-button"
            >
              Prepare drafts together
            </button>
          )}
        </div>
      </div> : (
        <div className="rounded-xl border border-orange-400/25 bg-orange-500/[0.06] p-4 text-sm text-orange-100">
          Archived campaigns can be restored for 30 days. After that, the daily cron permanently removes them from EmailBlast.
        </div>
      )}

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-red-400/30 bg-red-950/30 p-3 text-sm text-red-200"
        >
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full min-w-[900px] text-left">
          <thead className="bg-white/[0.05] text-sm text-gray-400">
            <tr>
              {selectionMode && !archiveView ? (
                <th className="w-14 p-4">
                  <span className="sr-only">Select</span>
                </th>
              ) : null}
              <th className="p-4">Campaign</th>
              <th className="p-4">Subject</th>
              <th className="p-4">{archiveView ? "Retention" : "Delivery"}</th>
              <th className="p-4">Created</th>
              <th className="p-4">Action</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((campaign) => {
              const membership = batchMemberships[campaign.id];
              const eligible =
                campaign.status === "draft" &&
                !campaign.cron_armed_at &&
                !membership;
              const resendDraft = activeResendDrafts[campaign.id];
              const displayStatus = getCampaignDisplayStatus(
                {
                  status: campaign.status,
                  cronArmedAt: campaign.cron_armed_at,
                  archivedAt: campaign.archived_at,
                },
                membership,
              );
              const primaryAction = getCampaignPrimaryAction(
                campaign.id,
                displayStatus,
                membership,
              );
              const campaignHref = `/dashboard/campaigns/${campaign.id}`;
              const batchHref = membership
                ? `/dashboard/campaign-batches/${membership.batchId}`
                : null;

              return (
                <tr
                  key={campaign.id}
                  className="border-t border-white/10 transition hover:bg-white/[0.03]"
                >
                  {selectionMode && !archiveView ? (
                    <td className="p-4 align-top">
                      {eligible ? (
                        <input
                          type="checkbox"
                          checked={validSelectedIds.includes(campaign.id)}
                          disabled={working}
                          onChange={(event) =>
                            toggleCampaign(campaign.id, event.target.checked)
                          }
                          aria-label={`Select ${campaign.name} for the delivery batch`}
                          className="h-4 w-4 accent-orange-500"
                        />
                      ) : (
                        <span className="text-gray-600" aria-hidden="true">
                          —
                        </span>
                      )}
                    </td>
                  ) : null}
                  <td className="p-4 align-top font-medium text-white">
                    <span className="block max-w-sm break-words">
                      {campaign.name}
                    </span>
                    <StatusBadge status={displayStatus} />
                  </td>
                  <td className="p-4 align-top text-gray-300">
                    <span className="block max-w-xs break-words">
                      {campaign.subject || "No subject"}
                    </span>
                  </td>
                  <td className="p-4 align-top text-sm text-gray-400">
                    {campaign.archived_at ? (
                      <span className="text-orange-200">
                        Permanently removed {formatDeletionDate(campaign.archived_at)}
                      </span>
                    ) : membership ? (
                      <Link
                        href={batchHref!}
                        className="font-medium text-orange-300 hover:text-orange-200"
                      >
                        {membership.batchName}
                      </Link>
                    ) : (
                      "Not in a delivery batch"
                    )}
                  </td>
                  <td className="p-4 align-top text-sm text-gray-400">
                    {formatManilaDate(campaign.created_at)}
                  </td>
                  <td className="p-4 align-top">
                    <div className="flex min-w-max items-start gap-2">
                      {campaign.archived_at ? (
                        <CampaignArchiveButton campaignId={campaign.id} mode="restore" />
                      ) : <Link
                        href={primaryAction.href}
                        className="inline-flex min-h-11 items-center whitespace-nowrap rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-600"
                      >
                        {primaryAction.label}
                      </Link>}
                      <details className="group">
                        <summary className="inline-flex min-h-11 cursor-pointer list-none items-center rounded-lg border border-white/25 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400">
                          More
                          <span aria-hidden="true" className="ml-2 text-xs">
                            ▾
                          </span>
                        </summary>
                        <div className="mt-2 flex max-w-56 flex-col gap-2 rounded-lg border border-white/15 bg-[#171717] p-2 shadow-xl">
                          {campaign.archived_at ? (
                            <Link
                              href={campaignHref}
                              className="rounded-md px-3 py-2 text-sm text-gray-200 hover:bg-white/[0.06]"
                            >
                              View archived campaign
                            </Link>
                          ) : primaryAction.href !== campaignHref ? (
                            <Link
                              href={campaignHref}
                              className="rounded-md px-3 py-2 text-sm text-gray-200 hover:bg-white/[0.06]"
                            >
                              Preview campaign
                            </Link>
                          ) : null}
                          {batchHref && primaryAction.href !== batchHref ? (
                            <Link
                              href={batchHref}
                              className="rounded-md px-3 py-2 text-sm text-gray-200 hover:bg-white/[0.06]"
                            >
                              View delivery batch
                            </Link>
                          ) : null}
                          {!campaign.archived_at &&
                          (campaign.status === "sent" ||
                          campaign.status === "failed") ? (
                            resendDraft ? (
                              <Link
                                href={`/dashboard/campaigns/${resendDraft.id}${resendDraft.armed ? "" : "/edit"}`}
                                className="rounded-md px-3 py-2 text-sm font-semibold text-orange-200 hover:bg-orange-500/10"
                              >
                                {resendDraft.armed
                                  ? "View resend waiting for cron"
                                  : "Continue resend draft"}
                              </Link>
                            ) : (
                              <EditAndResendButton
                                campaignId={campaign.id}
                                compact
                              />
                            )
                          ) : null}
                          {!campaign.archived_at &&
                          !["prepared", "waiting", "sending"].includes(displayStatus) ? (
                            <CampaignArchiveButton
                              campaignId={campaign.id}
                              mode="archive"
                            />
                          ) : null}
                        </div>
                      </details>
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

function StatusBadge({ status }: { status: CampaignDisplayStatus }) {
  const labels: Record<CampaignDisplayStatus, string> = {
    archived: "Archived",
    draft: "Draft",
    prepared: "Prepared",
    waiting: "Waiting for cron",
    sending: "Sending",
    sent: "Sent",
    failed: "Needs attention",
  };
  const tones: Record<CampaignDisplayStatus, string> = {
    archived: "border-orange-400/35 bg-orange-500/10 text-orange-200",
    draft: "border-white/20 bg-white/[0.04] text-gray-300",
    prepared: "border-amber-400/30 bg-amber-500/10 text-amber-200",
    waiting: "border-orange-400/35 bg-orange-500/10 text-orange-200",
    sending: "border-sky-400/35 bg-sky-500/10 text-sky-200",
    sent: "border-emerald-400/35 bg-emerald-500/10 text-emerald-200",
    failed: "border-red-400/35 bg-red-500/10 text-red-200",
  };
  return (
    <span
      className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${tones[status]}`}
    >
      {labels[status]}
    </span>
  );
}

function formatManilaDate(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}

function formatDeletionDate(archivedAt: string) {
  const deletesAt = new Date(
    new Date(archivedAt).getTime() + 30 * 24 * 60 * 60 * 1000,
  );
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeZone: "Asia/Manila",
  }).format(deletesAt);
}
