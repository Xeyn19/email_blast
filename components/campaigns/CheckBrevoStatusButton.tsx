
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  campaignId: string;
  canCheck: boolean;
};

export function CheckBrevoStatusButton({
  campaignId,
  canCheck,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");

  async function handleCheck() {
    setLoading(true);
    setResult("");

    try {
      const response = await fetch(
        `/api/campaigns/${campaignId}/check-brevo`,
        { method: "POST" }
      );

      const data = await response.json();

      if (!response.ok) {
        setResult(data.error || "Unable to check campaign status.");
        return;
      }

      setResult(
        `Brevo status: ${data.brevoStatus}. EmailBlast status: ${data.campaignStatus}.`
      );

      // Refresh campaign details with the latest Supabase data.
      router.refresh();
    } catch {
      setResult("Unable to connect to the status-check API.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleCheck}
        disabled={!canCheck || loading}
        className="rounded-lg border border-orange-500 px-5 py-3 font-semibold text-orange-600 transition hover:bg-orange-500/10 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Checking..." : "Check Sending Status"}
      </button>

      {!canCheck && (
        <p className="text-xs text-gray-500">
          Create the Brevo campaign first.
        </p>
      )}

      {result && (
        <p className="rounded-lg bg-gray-100 p-3 text-sm text-gray-700">
          {result}
        </p>
      )}
    </div>
  );
}
