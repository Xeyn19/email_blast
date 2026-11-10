
"use client";

import { useState } from "react";

type Props = {
  campaignId: string;
  canCreate: boolean;
};

export function CreateBrevoCampaignButton({
  campaignId,
  canCreate,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleCreate() {
    setLoading(true);
    setResult("");

    try {
      const response = await fetch(
        `/api/campaigns/${campaignId}/create-brevo`,
        { method: "POST" }
      );

      const data = await response.json();

      if (!response.ok) {
        setResult(data.error || "Unable to create Brevo campaign.");
        return;
      }

      setSuccess(true);
      setResult(
        `Brevo draft created successfully! Campaign ID: ${data.brevoCampaignId}. Refresh the page to update the next action.`
      );
    } catch {
      setResult("Unable to connect to the campaign creation API.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleCreate}
        disabled={!canCreate || loading || success}
        className="rounded-lg bg-orange-500 px-6 py-3 font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading
          ? "Creating Brevo Draft..."
          : success
            ? "Brevo Draft Created"
            : "Create Email Draft in Brevo"}
      </button>

      {!canCreate && (
        <p className="text-xs text-gray-500">
          Synchronize campaign contacts with Brevo first.
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
