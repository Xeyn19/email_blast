"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CampaignCronControls({ campaignId, armed, canPrepare }: { campaignId: string; armed: boolean; canPrepare: boolean }) {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  async function updateCron(method: "POST" | "DELETE") {
    setWorking(true);
    setError("");
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/cron`, { method });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error || "Unable to update the cron slot.");
        return;
      }
      router.refresh();
    } catch {
      setError("Unable to update the cron slot. Check your connection and try again.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div>
      {armed ? (
        <button type="button" disabled={working} onClick={() => void updateCron("DELETE")} className="campaign-secondary-button">
          {working ? "Removing…" : "Remove from cron"}
        </button>
      ) : canPrepare ? (
        <button type="button" disabled={working} onClick={() => void updateCron("POST")} className="campaign-primary-button !ml-0">
          {working ? "Preparing campaign…" : "Prepare for cron"}
        </button>
      ) : null}
      {error && <p role="alert" className="mt-3 max-w-sm text-sm text-red-300">{error}</p>}
    </div>
  );
}

