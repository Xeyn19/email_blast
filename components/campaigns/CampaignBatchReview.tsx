"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type BatchCampaign = {
  name: string;
  subject: string | null;
  status: string;
  recipientCount: number;
  cronArmedAt: string | null;
};

type BatchItem = {
  campaignId: string;
  position: number;
  preparationStatus: "pending" | "preparing" | "prepared" | "failed";
  lastError: string | null;
  preparedAt: string | null;
  campaign: BatchCampaign;
};

type BatchDetail = {
  id: string;
  name: string;
  status: "draft" | "preparing" | "prepared" | "waiting" | "sending" | "completed" | "completed_with_errors" | "cancelled";
  preparedAt: string | null;
  armedAt: string | null;
  claimedAt: string | null;
  completedAt: string | null;
  lastError: string | null;
  items: BatchItem[];
};

async function fetchBatchDetail(batchId: string) {
  const response = await fetch(`/api/campaign-batches/${batchId}`, {
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok || !result.batch) {
    throw new Error(result.error || "Unable to load this delivery batch.");
  }
  return result.batch as BatchDetail;
}

export function CampaignBatchReview({ batchId }: { batchId: string }) {
  const router = useRouter();
  const [batch, setBatch] = useState<BatchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState("");

  const loadBatch = useCallback(async () => {
    setBatch(await fetchBatchDetail(batchId));
  }, [batchId]);

  useEffect(() => {
    let active = true;
    fetchBatchDetail(batchId)
      .then((result) => {
        if (active) setBatch(result);
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Unable to load this delivery batch.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [batchId]);

  useEffect(() => {
    if (batch?.status !== "sending") return;
    let active = true;
    let timeout: number | undefined;
    async function poll() {
      await loadBatch().catch(() => undefined);
      if (active) timeout = window.setTimeout(poll, 4000);
    }
    timeout = window.setTimeout(poll, 4000);
    return () => {
      active = false;
      if (timeout) window.clearTimeout(timeout);
    };
  }, [batch?.status, loadBatch]);

  const counts = useMemo(() => {
    const items = batch?.items ?? [];
    return {
      total: items.length,
      prepared: items.filter((item) => item.preparationStatus === "prepared").length,
      failedPreparation: items.filter((item) => item.preparationStatus === "failed").length,
      sent: items.filter((item) => item.campaign.status === "sent").length,
      sending: items.filter((item) => item.campaign.status === "sending").length,
      failed: items.filter((item) => item.campaign.status === "failed").length,
    };
  }, [batch]);

  async function runAction(action: "prepare" | "cron", method: "POST" | "DELETE" = "POST") {
    setWorking(`${action}:${method}`);
    setError("");
    try {
      const response = await fetch(`/api/campaign-batches/${batchId}/${action}`, { method });
      const result = await response.json().catch(() => ({}));
      if (!response.ok && response.status !== 207) {
        setError(result.error || "Unable to update this delivery batch.");
        return;
      }
      await loadBatch();
      router.refresh();
    } catch {
      setError("Unable to update this delivery batch. Check your connection and try again.");
    } finally {
      setWorking(null);
    }
  }

  async function removeItem(campaignId: string) {
    setWorking(`remove:${campaignId}`);
    setError("");
    try {
      const response = await fetch(
        `/api/campaign-batches/${batchId}/items/${campaignId}`,
        { method: "DELETE" },
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(result.error || "Unable to remove this campaign from the batch.");
        return;
      }
      await loadBatch();
      router.refresh();
    } catch {
      setError("Unable to remove this campaign. Check your connection and try again.");
    } finally {
      setWorking(null);
    }
  }

  if (loading) return <p className="py-12 text-sm text-gray-400">Loading delivery batch…</p>;
  if (!batch) return <p role="alert" className="rounded-xl border border-red-400/30 bg-red-950/30 p-4 text-red-200">{error || "Delivery batch not found."}</p>;

  const canPrepare = batch.status === "draft" || batch.status === "prepared";
  const canArm =
    (batch.status === "prepared" || batch.status === "draft") &&
    counts.total > 0 &&
    counts.prepared === counts.total;
  const canRemoveItems = ["draft", "prepared", "waiting"].includes(batch.status);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-bold text-white">{batch.name}</h1>
              <BatchStatus status={batch.status} />
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-400">
              Each campaign remains an independent email. The fixed cron job sends the prepared campaigns during the same execution.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canPrepare ? (
              <button type="button" onClick={() => void runAction("prepare")} disabled={Boolean(working)} className="campaign-secondary-button">
                {working === "prepare:POST" ? "Preparing…" : counts.failedPreparation > 0 ? "Retry preparation" : "Prepare campaigns"}
              </button>
            ) : null}
            {canArm ? (
              <button type="button" onClick={() => void runAction("cron")} disabled={Boolean(working)} className="campaign-primary-button !ml-0">
                {working === "cron:POST" ? "Arming batch…" : `Arm ${counts.prepared} for cron`}
              </button>
            ) : null}
            {batch.status === "waiting" ? (
              <button type="button" onClick={() => void runAction("cron", "DELETE")} disabled={Boolean(working)} className="campaign-secondary-button">
                {working === "cron:DELETE" ? "Removing…" : "Remove batch from cron"}
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Delivery batch progress">
          <SummaryCard label="Campaigns" value={counts.total} />
          <SummaryCard label="Prepared" value={counts.prepared} tone="orange" />
          <SummaryCard label="Sent" value={counts.sent} tone="green" />
          <SummaryCard label="Needs attention" value={counts.failed + counts.failedPreparation} tone="red" />
        </div>
        {batch.status === "sending" ? <p role="status" className="mt-4 text-sm text-orange-200">{counts.sent} of {counts.total} sent · {counts.sending} sending</p> : null}
        {batch.armedAt ? <p className="mt-4 text-xs text-gray-400">Armed {formatManilaDate(batch.armedAt)}</p> : null}
        {batch.lastError ? <p role="alert" className="mt-4 rounded-lg border border-red-400/30 bg-red-950/30 p-3 text-sm text-red-200">{batch.lastError}</p> : null}
        {error ? <p role="alert" className="mt-4 rounded-lg border border-red-400/30 bg-red-950/30 p-3 text-sm text-red-200">{error}</p> : null}
      </section>

      <section aria-labelledby="batch-campaigns-heading">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="batch-campaigns-heading" className="text-xl font-semibold">Campaigns in this batch</h2>
            <p className="mt-1 text-sm text-gray-400">Review preparation results before arming the batch.</p>
          </div>
          <Link href="/dashboard/campaigns" className="text-sm font-semibold text-orange-300 hover:text-orange-200">Back to campaigns</Link>
        </div>

        <div className="grid gap-4">
          {batch.items.map((item) => (
            <article key={item.campaignId} className="rounded-xl border border-white/10 bg-[#121212] p-4 md:p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-orange-500 text-xs font-bold text-white">{item.position}</span>
                    <h3 className="break-words text-lg font-semibold text-white">{item.campaign.name}</h3>
                    <PreparationStatus status={item.preparationStatus} campaignStatus={item.campaign.status} />
                  </div>
                  <p className="mt-2 text-sm text-gray-300">{item.campaign.subject || "No subject"}</p>
                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-400">
                    <span>{item.campaign.recipientCount} recipients</span>
                    {item.preparedAt ? <span>Prepared {formatManilaDate(item.preparedAt)}</span> : null}
                  </div>
                  {item.lastError ? <p role="alert" className="mt-3 text-sm text-red-300">{item.lastError}</p> : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {item.campaign.status === "draft" &&
                  !item.campaign.cronArmedAt &&
                  (batch.status === "draft" || batch.status === "prepared") ? (
                    <Link href={`/dashboard/campaigns/${item.campaignId}/edit`} className="campaign-secondary-button">Edit</Link>
                  ) : null}
                  <Link href={`/dashboard/campaigns/${item.campaignId}`} className="campaign-secondary-button">Preview</Link>
                  {canRemoveItems ? (
                    <button type="button" onClick={() => void removeItem(item.campaignId)} disabled={Boolean(working)} className="campaign-secondary-button border-red-400/40 text-red-200 hover:bg-red-950/30">
                      {working === `remove:${item.campaignId}` ? "Removing…" : "Remove from batch"}
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function BatchStatus({ status }: { status: BatchDetail["status"] }) {
  const labels: Record<BatchDetail["status"], string> = {
    draft: "Draft batch",
    preparing: "Preparing",
    prepared: "Prepared",
    waiting: "Waiting for cron",
    sending: "Sending",
    completed: "Completed",
    completed_with_errors: "Completed with errors",
    cancelled: "Cancelled",
  };
  return <span className="rounded-full border border-orange-400/40 bg-orange-500/10 px-3 py-1 text-xs font-semibold text-orange-200">{labels[status]}</span>;
}

function PreparationStatus({ status, campaignStatus }: { status: BatchItem["preparationStatus"]; campaignStatus: string }) {
  const label = campaignStatus === "sent" ? "Sent" : campaignStatus === "sending" ? "Sending" : campaignStatus === "failed" ? "Needs attention" : status === "failed" ? "Preparation failed" : status;
  const tone = campaignStatus === "sent" ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200" : campaignStatus === "failed" || status === "failed" ? "border-red-400/40 bg-red-500/10 text-red-200" : "border-white/15 bg-white/[0.04] text-gray-300";
  return <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${tone}`}>{label}</span>;
}

function SummaryCard({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "orange" | "green" | "red" }) {
  const tones = { default: "border-white/10", orange: "border-orange-400/30", green: "border-emerald-400/30", red: "border-red-400/30" };
  return <div className={`rounded-xl border bg-black/20 p-4 ${tones[tone]}`}><span className="text-xs text-gray-400">{label}</span><strong className="mt-1 block text-2xl text-white">{value}</strong></div>;
}

function formatManilaDate(value: string) {
  return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" }).format(new Date(value));
}
