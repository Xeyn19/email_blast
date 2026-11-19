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

import { POST } from "./route";

type SourceResult = {
  data: { id: string; status: string } | null;
  error: { message: string } | null;
};

function createSupabaseClient(
  sourceResult: SourceResult,
  user: { id: string } | null = { id: "user-1" },
) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(sourceResult),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.is.mockReturnValue(query);

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
        error: null,
      }),
    },
    from: vi.fn().mockReturnValue(query),
  };
}

function invokePost() {
  return POST(new Request("http://localhost/api/campaigns/source-1/resend", {
    method: "POST",
  }), {
    params: Promise.resolve({ id: "source-1" }),
  });
}

describe("POST /api/campaigns/[id]/resend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires an authenticated user", async () => {
    mocks.createClient.mockResolvedValue(
      createSupabaseClient({ data: null, error: null }, null),
    );

    const response = await invokePost();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Your session has expired. Please log in again.",
    });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("does not expose a missing or unowned source campaign", async () => {
    mocks.createClient.mockResolvedValue(
      createSupabaseClient({ data: null, error: null }),
    );

    const response = await invokePost();

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Campaign not found." });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it.each(["draft", "sending"])(
    "rejects a %s source campaign",
    async (status) => {
      mocks.createClient.mockResolvedValue(
        createSupabaseClient({
          data: { id: "source-1", status },
          error: null,
        }),
      );

      const response = await invokePost();

      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({
        error: "Only sent or failed campaigns can be edited and resent.",
      });
      expect(mocks.createAdminClient).not.toHaveBeenCalled();
    },
  );

  it.each(["sent", "failed"])(
    "creates a new editable draft from a %s campaign",
    async (status) => {
      mocks.createClient.mockResolvedValue(
        createSupabaseClient({
          data: { id: "source-1", status },
          error: null,
        }),
      );
      const rpc = vi.fn().mockResolvedValue({
        data: [
          {
            campaign_id: "draft-1",
            created: true,
            cron_armed_at: null,
          },
        ],
        error: null,
      });
      mocks.createAdminClient.mockReturnValue({ rpc });

      const response = await invokePost();

      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({
        success: true,
        campaignId: "draft-1",
        created: true,
        editable: true,
      });
      expect(rpc).toHaveBeenCalledWith("create_or_get_resend_draft", {
        p_source_campaign_id: "source-1",
        p_user_id: "user-1",
      });
    },
  );

  it("returns the existing armed resend draft without marking it editable", async () => {
    mocks.createClient.mockResolvedValue(
      createSupabaseClient({
        data: { id: "source-1", status: "sent" },
        error: null,
      }),
    );
    mocks.createAdminClient.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({
        data: [
          {
            campaign_id: "draft-1",
            created: false,
            cron_armed_at: "2026-11-19T01:00:00.000Z",
          },
        ],
        error: null,
      }),
    });

    const response = await invokePost();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      campaignId: "draft-1",
      created: false,
      editable: false,
    });
  });

  it("returns a safe error when the atomic database operation fails", async () => {
    mocks.createClient.mockResolvedValue(
      createSupabaseClient({
        data: { id: "source-1", status: "sent" },
        error: null,
      }),
    );
    mocks.createAdminClient.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "database detail that must not be exposed" },
      }),
    });

    const response = await invokePost();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Unable to create the resend draft.",
    });
  });
});
