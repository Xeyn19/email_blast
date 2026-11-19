import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  reconcileCampaignStatus: vi.fn(),
  refreshBatchAggregate: vi.fn(),
  runBatchWithConcurrency: vi.fn(),
}));

vi.mock("@/lib/campaign-batches/execution", () => ({
  runBatchWithConcurrency: mocks.runBatchWithConcurrency,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock("@/lib/campaigns/service", () => ({
  CampaignServiceError: class CampaignServiceError extends Error {},
  reconcileCampaignStatus: mocks.reconcileCampaignStatus,
  refreshBatchAggregate: mocks.refreshBatchAggregate,
}));

import { GET } from "./route";

type QueryResult = { data: unknown; error: { message: string } | null };

function createThenableQuery(result: QueryResult) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    maybeSingle: vi.fn(),
    then: (
      resolve: (value: QueryResult) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.maybeSingle.mockResolvedValue(result);
  return query;
}

function createSupabaseClient({
  batches,
  items,
  user = { id: "user-1" },
}: {
  batches: QueryResult[];
  items: QueryResult[];
  user?: { id: string } | null;
}) {
  let batchIndex = 0;
  let itemIndex = 0;
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
    },
    from: vi.fn((table: string) => {
      if (table === "campaign_batches") {
        return createThenableQuery(
          batches[Math.min(batchIndex++, batches.length - 1)],
        );
      }
      return createThenableQuery(
        items[Math.min(itemIndex++, items.length - 1)],
      );
    }),
  };
}

function batch(status: string) {
  return {
    id: "batch-1",
    name: "November batch",
    status,
    prepared_at: null,
    armed_at: null,
    claimed_at: "2026-11-19T08:00:00.000Z",
    completed_at:
      status === "completed" ? "2026-11-19T08:05:00.000Z" : null,
    last_error: null,
  };
}

function item(status: string) {
  return {
    campaign_id: `campaign-${status}`,
    position: 1,
    preparation_status: "prepared",
    last_error: null,
    prepared_at: "2026-11-19T07:55:00.000Z",
    campaigns: {
      user_id: "user-1",
      name: "Campaign",
      subject: "Subject",
      status,
      recipient_contact_ids: ["contact-1"],
      cron_armed_at: null,
    },
  };
}

function invokeGet() {
  return GET(new Request("http://localhost/api/campaign-batches/batch-1"), {
    params: Promise.resolve({ id: "batch-1" }),
  });
}

describe("GET /api/campaign-batches/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runBatchWithConcurrency.mockImplementation(
      async (ids: string[], _concurrency: number, task: (id: string) => Promise<unknown>) =>
        Promise.all(ids.map((id) => task(id))),
    );
    mocks.createAdminClient.mockReturnValue({ role: "service" });
    mocks.refreshBatchAggregate.mockResolvedValue({
      batchId: "batch-1",
      status: "completed",
    });
  });

  it("requires an authenticated user before using the admin client", async () => {
    mocks.createClient.mockResolvedValue(
      createSupabaseClient({
        batches: [{ data: null, error: null }],
        items: [{ data: [], error: null }],
        user: null,
      }),
    );

    const response = await invokeGet();

    expect(response.status).toBe(401);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("recalculates a sending batch even when no campaign remains sending", async () => {
    const initialItems = [item("sent"), { ...item("sent"), campaign_id: "campaign-sent-2", position: 2 }];
    mocks.createClient.mockResolvedValue(
      createSupabaseClient({
        batches: [
          { data: batch("sending"), error: null },
          { data: batch("completed"), error: null },
        ],
        items: [
          { data: initialItems, error: null },
          { data: initialItems, error: null },
        ],
      }),
    );

    const response = await invokeGet();
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.batch.status).toBe("completed");
    expect(mocks.reconcileCampaignStatus).not.toHaveBeenCalled();
    expect(mocks.refreshBatchAggregate).toHaveBeenCalledWith(
      { role: "service" },
      "batch-1",
    );
  });

  it("reconciles sending campaigns with the scoped user before aggregation", async () => {
    const sendingItem = item("sending");
    mocks.createClient.mockResolvedValue(
      createSupabaseClient({
        batches: [
          { data: batch("sending"), error: null },
          { data: batch("sending"), error: null },
        ],
        items: [
          { data: [sendingItem], error: null },
          { data: [sendingItem], error: null },
        ],
      }),
    );
    mocks.reconcileCampaignStatus.mockResolvedValue({
      status: "sending",
      terminal: false,
    });

    const response = await invokeGet();

    expect(response.status).toBe(200);
    expect(mocks.reconcileCampaignStatus).toHaveBeenCalledWith(
      { role: "service" },
      "campaign-sending",
      "user-1",
      5_000,
    );
    expect(mocks.refreshBatchAggregate).toHaveBeenCalled();
  });
});
