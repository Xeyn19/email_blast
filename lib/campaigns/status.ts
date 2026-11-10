export type CampaignStatus = "draft" | "sending" | "sent" | "failed";

export type BrevoStatusResult = {
  status: CampaignStatus;
  terminal: boolean;
};

export function mapBrevoStatus(
  brevoStatus: string,
  currentStatus: CampaignStatus
): BrevoStatusResult {
  if (brevoStatus === "sent") {
    return { status: "sent", terminal: true };
  }

  if (["cancelled", "suspended"].includes(brevoStatus)) {
    return { status: "failed", terminal: true };
  }

  if (
    ["queued", "in_process", "in_review", "cancelling"].includes(
      brevoStatus
    )
  ) {
    return { status: "sending", terminal: false };
  }

  return { status: currentStatus, terminal: false };
}

