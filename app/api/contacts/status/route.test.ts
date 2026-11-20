import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

import { PATCH } from "./route";

function createRequest(body: unknown) {
  return new Request("http://localhost/api/contacts/status", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

type ClientOptions = {
  user?: { id: string } | null;
  ownedIds?: string[];
  updatedIds?: string[];
  ownershipError?: { message: string } | null;
  updateError?: { message: string } | null;
};

function createSupabaseClient(options: ClientOptions = {}) {
  const user = options.user === undefined ? { id: "user-1" } : options.user;
  const ownedIds = options.ownedIds ?? ["contact-1"];
  const updatedIds = options.updatedIds ?? ownedIds;
  const ownershipError = options.ownershipError ?? null;
  const updateError = options.updateError ?? null;
  const ownershipQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn().mockResolvedValue({
      data: ownedIds.map((id) => ({ id })),
      error: ownershipError,
    }),
  };
  ownershipQuery.select.mockReturnValue(ownershipQuery);
  ownershipQuery.eq.mockReturnValue(ownershipQuery);

  const updateQuery = {
    update: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    select: vi.fn().mockResolvedValue({
      data: updatedIds.map((id) => ({ id })),
      error: updateError,
    }),
  };
  updateQuery.update.mockReturnValue(updateQuery);
  updateQuery.eq.mockReturnValue(updateQuery);
  updateQuery.in.mockReturnValue(updateQuery);

  let call = 0;
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
    },
    from: vi.fn(() => (call++ === 0 ? ownershipQuery : updateQuery)),
    ownershipQuery,
    updateQuery,
  };
}

describe("PATCH /api/contacts/status", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires an authenticated user", async () => {
    const supabase = createSupabaseClient({ user: null });
    mocks.createClient.mockResolvedValue(supabase);

    const response = await PATCH(
      createRequest({ contactIds: ["contact-1"], status: "subscribed" }),
    );

    expect(response.status).toBe(401);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("validates the selection and requested status", async () => {
    mocks.createClient.mockResolvedValue(createSupabaseClient());

    const emptyResponse = await PATCH(
      createRequest({ contactIds: [], status: "subscribed" }),
    );
    const invalidResponse = await PATCH(
      createRequest({ contactIds: ["contact-1"], status: "blocked" }),
    );

    expect(emptyResponse.status).toBe(400);
    expect(invalidResponse.status).toBe(400);
  });

  it("does not update contacts outside the authenticated owner", async () => {
    const supabase = createSupabaseClient({ ownedIds: ["contact-1"] });
    mocks.createClient.mockResolvedValue(supabase);

    const response = await PATCH(
      createRequest({
        contactIds: ["contact-1", "contact-2"],
        status: "unsubscribed",
      }),
    );

    expect(response.status).toBe(404);
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });

  it("updates several owned contacts in one request", async () => {
    const supabase = createSupabaseClient({
      ownedIds: ["contact-1", "contact-2"],
    });
    mocks.createClient.mockResolvedValue(supabase);

    const response = await PATCH(
      createRequest({
        contactIds: ["contact-1", "contact-2"],
        status: "subscribed",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      updatedCount: 2,
      status: "subscribed",
    });
    expect(supabase.updateQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "subscribed",
        consent_source: "User-confirmed permission",
        unsubscribed_at: null,
      }),
    );
    expect(supabase.updateQuery.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(supabase.updateQuery.in).toHaveBeenCalledWith("id", [
      "contact-1",
      "contact-2",
    ]);
  });
});
