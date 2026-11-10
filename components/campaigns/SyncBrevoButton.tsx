
"use client";

import { useState } from "react";

type Props = {
  campaignId: string;
};

export function SyncBrevoButton({ campaignId }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleSync() {
    setLoading(true);
    setResult("");
    setSuccess(false);

    try {
      const response = await fetch(
        `/api/campaigns/${campaignId}/sync-brevo`,
        {
          method: "POST",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setResult(data.error || "Synchronization failed.");
        return;
      }

      setSuccess(true);
      setResult(
        `${data.synchronizedCount} contact(s) successfully synchronized with Brevo. List ID: ${data.brevoListId}`
      );
    } catch {
      setResult("Unable to connect to the synchronization API.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={handleSync}
        disabled={loading || success}
        className="rounded-lg bg-orange-500 px-6 py-3 font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading
          ? "Synchronizing..."
          : success
            ? "Contacts Synchronized"
            : "Sync Contacts to Brevo"}
      </button>

      {result && (
        <p
          className={`rounded-lg p-3 text-sm ${
            success
              ? "bg-green-500/10 text-green-400"
              : "bg-red-500/10 text-red-400"
          }`}
        >
          {result}
        </p>
      )}
    </div>
  );
}
