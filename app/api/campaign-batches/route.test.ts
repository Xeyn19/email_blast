import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class CampaignBatchError extends Error {
    constructor(
      message: string,
      readonly status = 400,
      readonly code = "batch_error",
    ) {
      super(message);
    }
  }

  return {
    createClient: vi.fn(),
    createBatchFromCampaigns: vi.fn(),
    CampaignBatchError,
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/campaign-batches/service", () => ({
  CampaignBatchError: mocks.CampaignBatchError,
  createBatchFromCampaigns: mocks.createBatchFromCampaigns,
}));

import { POST } from "./route";

function request(campaignIds = ["campaign-1"]) {
  return new Request("http://localhost/api/campaign-batches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ campaignIds }),
  });
}

describe("POST /api/campaign-batches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-1" } },
          error: null,
        }),
      },
    });
  });

  it("returns the specific conflicting campaign and batch message", async () => {
    mocks.createBatchFromCampaigns.mockRejectedValue(
      new mocks.CampaignBatchError(
        "“November resend” already belongs to “Morning delivery”. Open that batch or select a different draft.",
        409,
        "campaign_already_batched",
      ),
    );

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error:
        "“November resend” already belongs to “Morning delivery”. Open that batch or select a different draft.",
      code: "campaign_already_batched",
    });
  });
});
