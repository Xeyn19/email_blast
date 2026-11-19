export type CampaignDisplayStatus =
  | "archived"
  | "draft"
  | "prepared"
  | "waiting"
  | "sending"
  | "sent"
  | "failed";

export type CampaignDeliveryMembership = {
  batchId: string;
  batchName: string;
  batchStatus: string;
  preparationStatus: string;
};

export function getCampaignDisplayStatus(
  campaign: {
    status: string;
    cronArmedAt: string | null;
    archivedAt?: string | null;
  },
  membership?: CampaignDeliveryMembership,
): CampaignDisplayStatus {
  if (campaign.archivedAt) return "archived";
  if (campaign.status === "sent") return "sent";
  if (campaign.status === "failed") return "failed";
  if (campaign.status === "sending") return "sending";
  if (campaign.cronArmedAt || membership?.batchStatus === "waiting") {
    return "waiting";
  }
  if (
    membership?.preparationStatus === "prepared" &&
    ["draft", "preparing", "prepared"].includes(membership.batchStatus)
  ) {
    return "prepared";
  }
  return "draft";
}

