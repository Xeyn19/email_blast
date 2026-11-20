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

export function getEligibleBatchCampaignIds(
  campaigns: Array<{
    id: string;
    status: string;
    cronArmedAt: string | null;
  }>,
  memberships: Record<string, CampaignDeliveryMembership>,
) {
  return campaigns.flatMap((campaign) =>
    campaign.status === "draft" &&
    !campaign.cronArmedAt &&
    !memberships[campaign.id]
      ? [campaign.id]
      : [],
  );
}

export function retainEligibleBatchSelection(
  selectedIds: string[],
  eligibleIds: string[],
) {
  const eligibleIdSet = new Set(eligibleIds);
  return selectedIds.filter((campaignId) => eligibleIdSet.has(campaignId));
}

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

