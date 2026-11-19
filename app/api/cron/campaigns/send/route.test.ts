import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isValidCronToken: vi.fn(),
  createAdminClient: vi.fn(),
  refreshBatchAggregate: vi.fn(),
  sendClaimedCampaign: vi.fn(),
  runBatchWithConcurrency: vi.fn(),
}));

vi.mock("@/lib/campaigns/security", () => ({
  isValidCronToken: mocks.isValidCronToken,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock("@/lib/campaigns/service", () => ({
  CampaignServiceError: class CampaignServiceError extends Error {},
  refreshBatchAggregate: mocks.refreshBatchAggregate,
  sendClaimedCampaign: mocks.sendClaimedCampaign,
}));
vi.mock("@/lib/campaign-batches/execution", () => ({
  runBatchWithConcurrency: mocks.runBatchWithConcurrency,
}));

import { POST } from "./route";

describe("POST /api/cron/campaigns/send archive cleanup", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "cron-secret";
  });

  afterEach(() => {
    process.env.CRON_SECRET = originalSecret;
  });

  it("does not run cleanup for an invalid token", async () => {
    mocks.isValidCronToken.mockReturnValue(false);

    const response = await POST(
      new Request("http://localhost/api/cron/campaigns/send?token=wrong", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(401);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("purges expired archives even when no batch is armed", async () => {
    mocks.isValidCronToken.mockReturnValue(true);
    const rpc = vi.fn((name: string) => {
      if (name === "purge_expired_campaign_archive") {
        return Promise.resolve({
          data: [{ purged_count: 3 }],
          error: null,
        });
      }
      return Promise.resolve({ data: [], error: null });
    });
    mocks.createAdminClient.mockReturnValue({ rpc });

    const response = await POST(
      new Request(
        "http://localhost/api/cron/campaigns/send?token=cron-secret",
        { method: "POST" },
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      sent: false,
      reason: "no_batch_armed",
      purgedCampaigns: 3,
      archiveCleanupOk: true,
    });
    expect(rpc).toHaveBeenNthCalledWith(
      1,
      "purge_expired_campaign_archive",
    );
  });
});
