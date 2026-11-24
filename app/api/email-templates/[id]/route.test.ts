import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/email-templates/processor", () => ({
  deriveTemplateMetadata: vi.fn(() => ({
    defaultSubject: "Fallback subject",
    defaultPreviewText: "Fallback preview",
  })),
}));

import { DELETE, GET } from "./route";

const TEMPLATE_ID = "11111111-1111-4111-8111-111111111111";

function createClient({
  user = { id: "user-1" } as { id: string } | null,
  result,
}: {
  user?: { id: string } | null;
  result: { data: unknown; error: unknown };
}) {
  const query = {
    select: vi.fn(),
    update: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  query.select.mockReturnValue(query);
  query.update.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.is.mockReturnValue(query);

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
    },
    from: vi.fn().mockReturnValue(query),
    query,
  };
}

function context() {
  return { params: Promise.resolve({ id: TEMPLATE_ID }) };
}

describe("/api/email-templates/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires authentication before deleting a template", async () => {
    const client = createClient({ user: null, result: { data: null, error: null } });
    mocks.createClient.mockResolvedValue(client);

    const response = await DELETE(
      new Request(`http://localhost/api/email-templates/${TEMPLATE_ID}`, {
        method: "DELETE",
      }),
      context(),
    );

    expect(response.status).toBe(401);
    expect(client.from).not.toHaveBeenCalled();
  });

  it("soft-deletes an owned active template", async () => {
    const client = createClient({
      result: { data: { id: TEMPLATE_ID }, error: null },
    });
    mocks.createClient.mockResolvedValue(client);

    const response = await DELETE(
      new Request(`http://localhost/api/email-templates/${TEMPLATE_ID}`, {
        method: "DELETE",
      }),
      context(),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      templateId: TEMPLATE_ID,
    });
    expect(client.query.update).toHaveBeenCalledWith(
      expect.objectContaining({
        archived_at: expect.any(String),
        updated_at: expect.any(String),
      }),
    );
    expect(client.query.is).toHaveBeenCalledWith("archived_at", null);
  });

  it("does not expose missing, already deleted, or unowned templates", async () => {
    const client = createClient({ result: { data: null, error: null } });
    mocks.createClient.mockResolvedValue(client);

    const response = await DELETE(
      new Request(`http://localhost/api/email-templates/${TEMPLATE_ID}`, {
        method: "DELETE",
      }),
      context(),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Email template not found." });
  });

  it("reports archived state when an existing campaign loads its template", async () => {
    const client = createClient({
      result: {
        data: {
          id: TEMPLATE_ID,
          name: "Partner outreach",
          source_filename: "partner.html",
          html_content: "<html><head><title>Partner outreach</title></head><body><p>Campaign content for partners.</p></body></html>",
          asset_urls: ["https://example.com/image.png"],
          default_subject: "Partner outreach",
          default_preview_text: "Campaign content for partners.",
          archived_at: "2026-11-24T08:00:00.000Z",
          created_at: "2026-11-23T08:00:00.000Z",
          updated_at: "2026-11-24T08:00:00.000Z",
        },
        error: null,
      },
    });
    mocks.createClient.mockResolvedValue(client);

    const response = await GET(
      new Request(`http://localhost/api/email-templates/${TEMPLATE_ID}`),
      context(),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      template: {
        id: TEMPLATE_ID,
        archived: true,
        assetUrls: ["https://example.com/image.png"],
      },
    });
  });
});
