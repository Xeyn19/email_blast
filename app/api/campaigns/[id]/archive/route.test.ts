import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

import { DELETE, POST } from "./route";

function createSupabaseClient(
  campaign: { id: string } | null,
  user: { id: string } | null = { id: "user-1" },
) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data: campaign, error: null }),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
    },
    from: vi.fn().mockReturnValue(query),
  };
}

function context() {
  return { params: Promise.resolve({ id: "campaign-1" }) };
}

describe("/api/campaigns/[id]/archive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires authentication before using the service role", async () => {
    mocks.createClient.mockResolvedValue(createSupabaseClient(null, null));

    const response = await POST(
      new Request("http://localhost/api/campaigns/campaign-1/archive"),
      context(),
    );

    expect(response.status).toBe(401);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("does not expose another user's campaign", async () => {
    mocks.createClient.mockResolvedValue(createSupabaseClient(null));

    const response = await POST(
      new Request("http://localhost/api/campaigns/campaign-1/archive"),
      context(),
    );

    expect(response.status).toBe(404);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("archives an owned campaign and returns its retention deadline", async () => {
    mocks.createClient.mockResolvedValue(
      createSupabaseClient({ id: "campaign-1" }),
    );
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          campaign_id: "campaign-1",
          archived_at: "2026-11-19T08:00:00.000Z",
        },
      ],
      error: null,
    });
    mocks.createAdminClient.mockReturnValue({ rpc });

    const response = await POST(
      new Request("http://localhost/api/campaigns/campaign-1/archive"),
      context(),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      campaignId: "campaign-1",
      archivedAt: "2026-11-19T08:00:00.000Z",
      permanentlyDeletesAt: "2026-12-19T08:00:00.000Z",
    });
    expect(rpc).toHaveBeenCalledWith("set_campaign_archived", {
      p_campaign_id: "campaign-1",
      p_user_id: "user-1",
      p_archive: true,
    });
  });

  it("rejects archiving during active delivery", async () => {
    mocks.createClient.mockResolvedValue(
      createSupabaseClient({ id: "campaign-1" }),
    );
    mocks.createAdminClient.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "P0001", message: "campaign_archive_active_delivery" },
      }),
    });

    const response = await POST(
      new Request("http://localhost/api/campaigns/campaign-1/archive"),
      context(),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error:
        "Remove this campaign from its active delivery batch before archiving it.",
    });
  });

  it("restores an archived campaign", async () => {
    mocks.createClient.mockResolvedValue(
      createSupabaseClient({ id: "campaign-1" }),
    );
    const rpc = vi.fn().mockResolvedValue({
      data: [{ campaign_id: "campaign-1", archived_at: null }],
      error: null,
    });
    mocks.createAdminClient.mockReturnValue({ rpc });

    const response = await DELETE(
      new Request("http://localhost/api/campaigns/campaign-1/archive", {
        method: "DELETE",
      }),
      context(),
    );

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("set_campaign_archived", {
      p_campaign_id: "campaign-1",
      p_user_id: "user-1",
      p_archive: false,
    });
  });
});
