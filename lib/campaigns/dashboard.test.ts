import { describe, expect, it } from "vitest";
import { getCampaignDisplayStatus } from "./dashboard";

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
});
