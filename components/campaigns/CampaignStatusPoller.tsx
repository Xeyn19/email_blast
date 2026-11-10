"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function CampaignStatusPoller({ campaignId, active }: { campaignId: string; active: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    let stopped = false;

    async function checkStatus() {
      try {
        const response = await fetch(`/api/campaigns/${campaignId}/status`, { cache: "no-store" });
        if (!response.ok || stopped) return;
        const result = await response.json();
        if (result.terminal || result.status !== "sending") router.refresh();
      } catch {
        // A later poll or page visit can safely retry status reconciliation.
      }
    }

    void checkStatus();
    const interval = window.setInterval(checkStatus, 10_000);
    return () => { stopped = true; window.clearInterval(interval); };
  }, [active, campaignId, router]);

  return active ? <p className="text-sm text-gray-400" aria-live="polite">Checking Brevo automatically for delivery updates…</p> : null;
}

