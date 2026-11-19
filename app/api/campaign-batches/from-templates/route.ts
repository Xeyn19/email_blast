import { NextResponse } from "next/server";
import {
  armBatch,
  CampaignBatchError,
  createBatchFromTemplates,
  prepareBatch,
} from "@/lib/campaign-batches/service";
import { createClient } from "@/lib/supabase/server";

type TemplateInput = {
  templateId: string;
  name: string;
  subject: string;
  previewText?: string | null;
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Your session has expired. Please log in again." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const input = body as Record<string, unknown>;
  const items = Array.isArray(input.items)
    ? input.items.filter((item): item is TemplateInput => {
        if (!item || typeof item !== "object") return false;
        const value = item as Record<string, unknown>;
        return typeof value.templateId === "string" &&
          typeof value.name === "string" &&
          typeof value.subject === "string" &&
          (value.previewText === undefined || value.previewText === null || typeof value.previewText === "string");
      })
    : [];
  const recipientContactIds = Array.isArray(input.recipientContactIds)
    ? input.recipientContactIds.filter((id): id is string => typeof id === "string")
    : [];
  const deliveryMode = input.deliveryMode === "cron" ? "cron" : "draft";

  try {
    const created = await createBatchFromTemplates(
      supabase,
      user.id,
      items,
      recipientContactIds,
    );
    if (deliveryMode === "draft") {
      return NextResponse.json(created, { status: 201 });
    }

    const preparation = await prepareBatch(supabase, created.batchId, user.id);
    if (preparation.failedCount) {
      return NextResponse.json({
        ...created,
        preparation,
        status: "draft",
        armed: false,
      }, { status: 207 });
    }
    const armed = await armBatch(created.batchId, user.id);
    return NextResponse.json({ ...created, preparation, ...armed, armed: true }, { status: 201 });
  } catch (error) {
    if (error instanceof CampaignBatchError) {
      return NextResponse.json({
        error: error.message,
        code: error.code,
        batchId: error.batchId,
      }, { status: error.status });
    }
    return NextResponse.json({ error: "Unable to create campaigns from the selected templates." }, { status: 500 });
  }
}
