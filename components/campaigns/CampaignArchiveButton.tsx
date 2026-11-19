"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function CampaignArchiveButton({
  campaignId,
  mode,
}: {
  campaignId: string;
  mode: "archive" | "restore";
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const restoring = mode === "restore";

  async function updateArchive() {
    setWorking(true);
    setError("");
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/archive`, {
        method: restoring ? "DELETE" : "POST",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(
          result.error ||
            (restoring
              ? "Unable to restore this campaign."
              : "Unable to archive this campaign."),
        );
        return;
      }

      setConfirming(false);
      router.refresh();
    } catch {
      setError("Unable to update this campaign. Check your connection and try again.");
    } finally {
      setWorking(false);
    }
  }

  if (restoring) {
    return (
      <div className="min-w-[9rem]">
        <button
          type="button"
          disabled={working}
          aria-busy={working}
          onClick={() => void updateArchive()}
          className="inline-flex min-h-11 items-center rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {working ? "Restoring…" : "Restore campaign"}
        </button>
        {error ? <p role="alert" className="mt-2 max-w-xs text-xs text-red-300">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="min-w-[10rem]">
      {confirming ? (
        <div className="space-y-2 rounded-md border border-red-400/25 bg-red-950/20 p-2">
          <p className="text-xs leading-5 text-red-100">
            Archive for 30 days before permanent removal?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={working}
              onClick={() => void updateArchive()}
              className="rounded-md bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50"
            >
              {working ? "Archiving…" : "Archive"}
            </button>
            <button
              type="button"
              disabled={working}
              onClick={() => setConfirming(false)}
              className="rounded-md border border-white/20 px-3 py-2 text-xs text-gray-200 hover:bg-white/[0.06]"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="w-full rounded-md px-3 py-2 text-left text-sm text-red-200 hover:bg-red-500/10"
        >
          Archive campaign
        </button>
      )}
      {error ? <p role="alert" className="mt-2 max-w-xs text-xs text-red-300">{error}</p> : null}
    </div>
  );
}
