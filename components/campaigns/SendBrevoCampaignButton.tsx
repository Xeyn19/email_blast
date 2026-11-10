
"use client";

import { useState } from "react";

type Props = {
  campaignId: string;
  canSend: boolean;
};

export function SendBrevoCampaignButton({
  campaignId,
  canSend,
}: Props) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleSend() {
    setLoading(true);
    setResult("");

    try {
      const response = await fetch(
        `/api/campaigns/${campaignId}/send-brevo`,
        { method: "POST" }
      );

      const data = await response.json();

      if (!response.ok) {
        setResult(data.error || "Unable to send campaign.");
        return;
      }

      setSuccess(true);
      setConfirming(false);
      setResult("Brevo accepted your campaign for processing.");
    } catch {
      setResult("Unable to connect to Brevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setConfirming(true)}
        disabled={!canSend || loading || success}
        className="rounded-lg bg-orange-500 px-6 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Sending..." : success ? "Campaign Sent" : "Send Campaign"}
      </button>

      {!canSend && (
        <p className="text-xs text-gray-500">
          Complete contact synchronization and Brevo campaign creation first.
        </p>
      )}

      {confirming && canSend && (
        <div className="space-y-3 rounded-xl border border-orange-500/40 p-4">
          <p className="text-sm text-gray-700">
            Sending is irreversible. Are you sure you want to send this
            campaign to the selected recipients?
          </p>

          <button
            type="button"
            onClick={handleSend}
            disabled={loading}
            className="rounded-lg bg-orange-500 px-5 py-2 text-white disabled:opacity-50"
          >
            {loading ? "Sending..." : "Yes, Send Campaign"}
          </button>

          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={loading}
            className="ml-2 rounded-lg border px-5 py-2"
          >
            Cancel
          </button>
        </div>
      )}

      {result && (
        <p className="rounded-lg bg-gray-100 p-3 text-sm text-gray-700">
          {result}
        </p>
      )}
    </div>
  );
}
