"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ResendResponse = {
  campaignId?: string;
  editable?: boolean;
  error?: string;
};

export function EditAndResendButton({
  campaignId,
  compact = false,
}: {
  campaignId: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  async function createResendDraft() {
    setWorking(true);
    setError("");

    try {
      const response = await fetch(`/api/campaigns/${campaignId}/resend`, {
        method: "POST",
      });
      const result = (await response.json()) as ResendResponse;

      if (!response.ok || !result.campaignId) {
        setError(result.error || "Unable to create the resend draft.");
        return;
      }

      router.push(
        `/dashboard/campaigns/${result.campaignId}${result.editable === false ? "" : "/edit"}`,
      );
      router.refresh();
    } catch {
      setError("Unable to create the resend draft. Check your connection and try again.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className={compact ? "min-w-[9rem]" : "flex flex-col items-start gap-2"}>
      <button
        type="button"
        className={
          compact
            ? "whitespace-nowrap rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
            : "campaign-primary-button !ml-0"
        }
        disabled={working}
        aria-busy={working}
        onClick={() => void createResendDraft()}
      >
        {working ? "Creating draft…" : "Edit and resend"}
      </button>
      {error ? (
        <p role="alert" className="max-w-xs text-xs text-red-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}
