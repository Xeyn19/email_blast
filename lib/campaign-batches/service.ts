import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { compileRecipientToken } from "@/lib/email-templates/tokens";
import {
  CampaignServiceError,
  prepareCampaign,
} from "@/lib/campaigns/service";
import { createAdminClient } from "@/lib/supabase/admin";

export const MAX_BATCH_CAMPAIGNS = 10;
const PREPARATION_CONCURRENCY = 2;

type TemplateBatchItem = {
  templateId: string;
  name: string;
  subject: string;
  previewText?: string | null;
};

export type BatchPreparationItem = {
  campaignId: string;
  preparationStatus: "prepared" | "failed";
  lastError: string | null;
};

export class CampaignBatchError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly code = "batch_error",
    readonly batchId?: string,
  ) {
    super(message);
  }
}

function uniqueIds(ids: string[]) {
  return [...new Set(ids.filter(Boolean))];
}

function validateBatchSize(ids: string[]) {
  if (ids.length < 1 || ids.length > MAX_BATCH_CAMPAIGNS) {
    throw new CampaignBatchError(
      `Select between 1 and ${MAX_BATCH_CAMPAIGNS} campaigns.`,
      400,
      "invalid_batch_size",
    );
  }
}

function defaultBatchName(names: string[]) {
  const first = names[0]?.trim() || "Email campaign";
  return names.length === 1
    ? first
    : `${first} + ${names.length - 1} more`.slice(0, 160);
}

async function insertBatch(
  supabase: SupabaseClient,
  userId: string,
  campaigns: Array<{ id: string; name: string }>,
  requestedName?: string,
) {
  const { data: batch, error: batchError } = await supabase
    .from("campaign_batches")
    .insert({
      user_id: userId,
      name: requestedName?.trim().slice(0, 160) ||
        defaultBatchName(campaigns.map((campaign) => campaign.name)),
      status: "draft",
    })
    .select("id, name, status")
    .single();

  if (batchError || !batch) {
    throw new CampaignBatchError(
      "Unable to create the delivery batch.",
      500,
      "batch_create_failed",
    );
  }

  const { error: itemsError } = await supabase
    .from("campaign_batch_items")
    .insert(
      campaigns.map((campaign, index) => ({
        batch_id: batch.id,
        campaign_id: campaign.id,
        position: index + 1,
        preparation_status: "pending",
      })),
    );

  if (itemsError) {
    const admin = createAdminClient();
    await admin
      .from("campaign_batches")
      .delete()
      .eq("id", batch.id)
      .eq("user_id", userId)
      .eq("status", "draft");
    throw new CampaignBatchError(
      itemsError.code === "23505"
        ? "One or more campaigns already belong to a delivery batch."
        : "Unable to add campaigns to the delivery batch.",
      itemsError.code === "23505" ? 409 : 500,
      itemsError.code === "23505" ? "campaign_already_batched" : "batch_items_failed",
    );
  }

  return {
    batchId: batch.id as string,
    name: batch.name as string,
    status: batch.status as string,
    campaignIds: campaigns.map((campaign) => campaign.id),
  };
}

export async function createBatchFromCampaigns(
  supabase: SupabaseClient,
  userId: string,
  campaignIds: string[],
  name?: string,
) {
  const ids = uniqueIds(campaignIds);
  validateBatchSize(ids);

  const { data, error } = await supabase
    .from("campaigns")
    .select("id, name, status, cron_armed_at")
    .eq("user_id", userId)
    .is("archived_at", null)
    .in("id", ids);

  if (error) {
    throw new CampaignBatchError(
      "Unable to load the selected campaigns.",
      500,
      "campaign_lookup_failed",
    );
  }

  if (!data || data.length !== ids.length) {
    throw new CampaignBatchError(
      "One or more selected campaigns are unavailable.",
      404,
      "campaign_not_found",
    );
  }

  const byId = new Map(data.map((campaign) => [campaign.id as string, campaign]));
  const campaigns = ids.map((id) => byId.get(id)!);
  if (campaigns.some((campaign) => campaign.status !== "draft" || campaign.cron_armed_at)) {
    throw new CampaignBatchError(
      "Only unarmed draft campaigns can be added to a delivery batch.",
      409,
      "campaign_not_eligible",
    );
  }

  return insertBatch(
    supabase,
    userId,
    campaigns.map((campaign) => ({ id: campaign.id, name: campaign.name })),
    name,
  );
}

export async function prepareAndArmSingleCampaign(
  supabase: SupabaseClient,
  campaignId: string,
  userId: string,
) {
  const { data: existingItem } = await supabase
    .from("campaign_batch_items")
    .select("batch_id, campaign_batches!inner(user_id, status)")
    .eq("campaign_id", campaignId)
    .eq("campaign_batches.user_id", userId)
    .maybeSingle();

  let batchId = existingItem?.batch_id as string | undefined;
  if (!batchId) {
    const created = await createBatchFromCampaigns(
      supabase,
      userId,
      [campaignId],
    );
    batchId = created.batchId;
  }

  const preparation = await prepareBatch(supabase, batchId, userId);
  if (preparation.failedCount) {
    throw new CampaignBatchError(
      preparation.items[0]?.lastError || "The campaign could not be prepared.",
      400,
      "campaign_preparation_failed",
      batchId,
    );
  }

  const armed = await armBatch(batchId, userId);
  return {
    campaignId,
    batchId,
    armedAt: armed.armedAt,
    campaignCount: 1,
  };
}

export async function createBatchFromTemplates(
  supabase: SupabaseClient,
  userId: string,
  items: TemplateBatchItem[],
  recipientContactIds: string[],
) {
  if (items.length < 1 || items.length > MAX_BATCH_CAMPAIGNS) {
    throw new CampaignBatchError(
      `Select between 1 and ${MAX_BATCH_CAMPAIGNS} email templates.`,
      400,
      "invalid_batch_size",
    );
  }

  const templateIds = uniqueIds(items.map((item) => item.templateId));
  if (templateIds.length !== items.length) {
    throw new CampaignBatchError(
      "Choose each email template only once.",
      400,
      "duplicate_template",
    );
  }
  const recipients = uniqueIds(recipientContactIds);
  if (!recipients.length) {
    throw new CampaignBatchError(
      "Select at least one subscribed recipient.",
      400,
      "no_recipients",
    );
  }

  const [{ data: templates, error: templatesError }, { data: contacts, error: contactsError }] =
    await Promise.all([
      supabase
        .from("email_templates")
        .select("id, name, html_content")
        .eq("user_id", userId)
        .is("archived_at", null)
        .in("id", templateIds),
      supabase
        .from("contacts")
        .select("id")
        .eq("user_id", userId)
        .eq("status", "subscribed")
        .in("id", recipients),
    ]);

  if (templatesError || !templates || templates.length !== templateIds.length) {
    throw new CampaignBatchError(
      "One or more selected templates are unavailable.",
      400,
      "template_unavailable",
    );
  }
  if (contactsError || !contacts || contacts.length !== recipients.length) {
    throw new CampaignBatchError(
      "Some recipients are no longer subscribed. Review the audience and try again.",
      400,
      "recipients_changed",
    );
  }

  const templateById = new Map(templates.map((template) => [template.id as string, template]));
  const rows = items.map((item) => {
    const template = templateById.get(item.templateId)!;
    const name = item.name.trim();
    const subject = item.subject.trim();
    if (!name || !subject) {
      throw new CampaignBatchError(
        "Every email needs a campaign name and subject.",
        400,
        "missing_campaign_details",
      );
    }
    return {
      user_id: userId,
      name,
      subject,
      preview_text: item.previewText?.trim() || null,
      html_content: compileRecipientToken(template.html_content as string),
      message_mode: "template",
      template_id: template.id,
      recipient_contact_ids: recipients,
      status: "draft",
    };
  });

  const { data: campaigns, error: campaignError } = await supabase
    .from("campaigns")
    .insert(rows)
    .select("id, name");

  if (campaignError || !campaigns || campaigns.length !== rows.length) {
    throw new CampaignBatchError(
      "Unable to save the campaigns for this batch.",
      500,
      "campaign_create_failed",
    );
  }

  try {
    return await insertBatch(supabase, userId, campaigns);
  } catch (error) {
    const admin = createAdminClient();
    await admin
      .from("campaigns")
      .delete()
      .eq("user_id", userId)
      .in("id", campaigns.map((campaign) => campaign.id));
    throw error;
  }
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  task: (value: T) => Promise<R>,
) {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex++;
      results[index] = await task(values[index]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => worker()),
  );
  return results;
}

export async function prepareBatch(
  supabase: SupabaseClient,
  batchId: string,
  userId: string,
) {
  const { data: batch, error: batchError } = await supabase
    .from("campaign_batches")
    .select("id, status")
    .eq("id", batchId)
    .eq("user_id", userId)
    .maybeSingle();
  if (batchError || !batch) {
    throw new CampaignBatchError("Delivery batch not found.", 404, "not_found");
  }
  if (!['draft', 'prepared'].includes(batch.status)) {
    throw new CampaignBatchError(
      "This delivery batch cannot be prepared in its current state.",
      409,
      "invalid_batch_status",
      batchId,
    );
  }

  const { data: items, error: itemsError } = await supabase
    .from("campaign_batch_items")
    .select("id, campaign_id, position, preparation_status")
    .eq("batch_id", batchId)
    .order("position");
  if (itemsError || !items?.length) {
    throw new CampaignBatchError(
      "This delivery batch has no campaigns.",
      409,
      "empty_batch",
      batchId,
    );
  }

  const { error: preparingBatchError } = await supabase
    .from("campaign_batches")
    .update({ status: "preparing", last_error: null })
    .eq("id", batchId)
    .eq("user_id", userId);
  if (preparingBatchError) {
    throw new CampaignBatchError(
      "Unable to start preparing this delivery batch.",
      500,
      "batch_preparation_start_failed",
      batchId,
    );
  }

  const results = await mapWithConcurrency(items, PREPARATION_CONCURRENCY, async (item) => {
    if (item.preparation_status === "prepared") {
      return {
        campaignId: item.campaign_id as string,
        preparationStatus: "prepared" as const,
        lastError: null,
      };
    }
    try {
      const { error: preparingItemError } = await supabase
        .from("campaign_batch_items")
        .update({ preparation_status: "preparing", last_error: null })
        .eq("id", item.id);
      if (preparingItemError) {
        throw new CampaignBatchError(
          "Unable to save the campaign preparation progress.",
          500,
          "batch_item_preparation_start_failed",
          batchId,
        );
      }
      await prepareCampaign(supabase, item.campaign_id, userId);
      const preparedAt = new Date().toISOString();
      const { error: preparedItemError } = await supabase
        .from("campaign_batch_items")
        .update({
          preparation_status: "prepared",
          last_error: null,
          prepared_at: preparedAt,
        })
        .eq("id", item.id);
      if (preparedItemError) {
        throw new CampaignBatchError(
          "The Brevo draft was created, but its preparation status could not be saved.",
          500,
          "batch_item_preparation_save_failed",
          batchId,
        );
      }
      return {
        campaignId: item.campaign_id as string,
        preparationStatus: "prepared" as const,
        lastError: null,
      };
    } catch (error) {
      const message = error instanceof CampaignServiceError || error instanceof CampaignBatchError
        ? error.message
        : "Campaign preparation failed unexpectedly.";
      const { error: failedItemError } = await supabase
        .from("campaign_batch_items")
        .update({ preparation_status: "failed", last_error: message })
        .eq("id", item.id);
      return {
        campaignId: item.campaign_id as string,
        preparationStatus: "failed" as const,
        lastError: failedItemError
          ? `${message} The failure status could not be saved.`
          : message,
      };
    }
  });

  const preparedCount = results.filter((item) => item.preparationStatus === "prepared").length;
  const failedCount = results.length - preparedCount;
  const status = failedCount === 0 ? "prepared" : "draft";
  const { error: finishBatchError } = await supabase
    .from("campaign_batches")
    .update({
      status,
      prepared_at: failedCount === 0 ? new Date().toISOString() : null,
      last_error: failedCount ? `${failedCount} campaign${failedCount === 1 ? "" : "s"} need attention.` : null,
    })
    .eq("id", batchId)
    .eq("user_id", userId);
  if (finishBatchError) {
    throw new CampaignBatchError(
      "Campaigns were prepared, but the delivery batch status could not be saved.",
      500,
      "batch_preparation_finish_failed",
      batchId,
    );
  }

  return { batchId, status, preparedCount, failedCount, items: results };
}

export async function armBatch(batchId: string, userId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("arm_campaign_batch", {
    p_batch_id: batchId,
    p_user_id: userId,
  });
  const result = data?.[0];
  if (error?.code === "23505") {
    throw new CampaignBatchError(
      "Another delivery batch is already waiting for cron.",
      409,
      "batch_slot_occupied",
      batchId,
    );
  }
  if (error) {
    const notReady = error.message?.includes("campaign_batch_not_ready");
    throw new CampaignBatchError(
      notReady
        ? "Prepare every campaign before adding this batch to cron."
        : "Unable to add this delivery batch to cron.",
      notReady ? 409 : 500,
      notReady ? "batch_not_ready" : "batch_arm_failed",
      batchId,
    );
  }
  if (!result) {
    throw new CampaignBatchError(
      "This delivery batch is not ready to be added to cron.",
      409,
      "batch_not_ready",
      batchId,
    );
  }
  return {
    batchId: result.batch_id as string,
    armedAt: result.armed_at as string,
    campaignCount: Number(result.campaign_count),
    status: "waiting" as const,
  };
}

export async function disarmBatch(batchId: string, userId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("disarm_campaign_batch", {
    p_batch_id: batchId,
    p_user_id: userId,
  });
  const result = data?.[0];
  if (error || !result) {
    throw new CampaignBatchError(
      "This delivery batch is not waiting for cron.",
      409,
      "batch_not_waiting",
      batchId,
    );
  }
  return {
    batchId: result.batch_id as string,
    campaignCount: Number(result.campaign_count),
    status: "prepared" as const,
  };
}

export async function removeCampaignFromBatch(
  batchId: string,
  campaignId: string,
  userId: string,
) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("remove_campaign_from_batch", {
    p_batch_id: batchId,
    p_campaign_id: campaignId,
    p_user_id: userId,
  });
  const result = data?.[0];
  if (error || !result) {
    throw new CampaignBatchError(
      "Unable to remove this campaign from the delivery batch.",
      409,
      "remove_failed",
      batchId,
    );
  }
  return {
    batchId: result.batch_id as string,
    remainingCount: Number(result.remaining_count),
    status: result.batch_status as string,
  };
}
