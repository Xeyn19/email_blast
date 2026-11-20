import { describe, expect, it } from "vitest";
import {
  getCampaignDisplayStatus,
  getEligibleBatchCampaignIds,
  retainEligibleBatchSelection,
} from "./dashboard";

const preparedMembership = {
  batchId: "batch-1",
  batchName: "November delivery",
  batchStatus: "prepared",
  preparationStatus: "prepared",
};

describe("campaign dashboard status", () => {
  it("distinguishes drafts, prepared campaigns, and cron waiting campaigns", () => {
    expect(
      getCampaignDisplayStatus({ status: "draft", cronArmedAt: null })
    ).toBe("draft");
    expect(
      getCampaignDisplayStatus(
        { status: "draft", cronArmedAt: null },
        preparedMembership
      )
    ).toBe("prepared");
    expect(
      getCampaignDisplayStatus(
        { status: "draft", cronArmedAt: "2026-11-19T08:00:00Z" },
        preparedMembership
      )
    ).toBe("waiting");
  });

  it("uses delivery results before batch preparation state", () => {
    expect(
      getCampaignDisplayStatus(
        { status: "sent", cronArmedAt: null },
        preparedMembership
      )
    ).toBe("sent");
    expect(
      getCampaignDisplayStatus(
        { status: "failed", cronArmedAt: null },
        preparedMembership
      )
    ).toBe("failed");
  });

  it("shows archived campaigns independently of their previous status", () => {
    expect(
      getCampaignDisplayStatus({
        status: "sent",
        cronArmedAt: null,
        archivedAt: "2026-11-19T08:00:00.000Z",
      })
    ).toBe("archived");
  });
});

describe("campaign batch selection", () => {
  it("keeps only visible drafts that are still eligible for a batch", () => {
    const memberships = {
      "draft-in-batch": preparedMembership,
    };
    const eligibleIds = getEligibleBatchCampaignIds(
      [
        { id: "available-draft", status: "draft", cronArmedAt: null },
        { id: "draft-in-batch", status: "draft", cronArmedAt: null },
        { id: "waiting-draft", status: "draft", cronArmedAt: "2026-11-20T08:00:00Z" },
        { id: "sent-campaign", status: "sent", cronArmedAt: null },
      ],
      memberships,
    );

    expect(eligibleIds).toEqual(["available-draft"]);
    expect(
      retainEligibleBatchSelection(
        ["hidden-from-old-view", "draft-in-batch", "available-draft"],
        eligibleIds,
      ),
    ).toEqual(["available-draft"]);
  });
});
