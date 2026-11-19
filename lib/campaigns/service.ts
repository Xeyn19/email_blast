import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getDeliverabilityError } from "@/lib/campaigns/deliverability";
import {
  BREVO_RECIPIENT_NAME_ATTRIBUTE,
  campaignUsesRecipientPersonalization,
  getBrevoRecipientAttributes,
} from "@/lib/campaigns/personalization";
import {
  deriveBatchAggregateStatus,
  mapBrevoStatus,
  type CampaignStatus,
} from "@/lib/campaigns/status";

type CampaignRecord = {
  id: string;
  user_id: string;
  name: string;
  subject: string;
  preview_text: string | null;
  html_content: string;
  message_mode: "manual" | "template";
  template_id: string | null;
  recipient_contact_ids: string[] | null;
  status: CampaignStatus;
  brevo_list_id: number | string | null;
  brevo_campaign_id: number | string | null;
  brevo_synced_at: string | null;
  cron_armed_at: string | null;
  archived_at: string | null;
  sent_at?: string | null;
};

type ContactRecord = {
  id: string;
  full_name: string | null;
  company: string | null;
  email: string;
};

type BrevoContactAttribute = {
  category?: string;
  name?: string;
};

type BrevoConfiguration = {
  apiKey: string;
  senderEmail: string;
  senderName: string;
};

type BrevoSender = {
  id: number;
  active: boolean;
  email: string;
};

export class CampaignServiceError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly code = "campaign_error",
    readonly campaignId?: string
  ) {
    super(message);
  }
}

function getBrevoConfiguration(): BrevoConfiguration {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME;

  if (!apiKey || !senderEmail || !senderName) {
    throw new CampaignServiceError(
      "Brevo is not configured on the server.",
      500,
      "brevo_not_configured"
    );
  }

  return { apiKey, senderEmail, senderName };
}

function brevoHeaders(apiKey: string, includeJson = false) {
  return {
    accept: "application/json",
    "api-key": apiKey,
    ...(includeJson ? { "content-type": "application/json" } : {}),
  };
}

async function readJsonSafely(response: Response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getBrevoErrorMessage(
  result: Record<string, unknown> | null,
  fallback: string
) {
  const code = typeof result?.code === "string" ? result.code : "";
  const message = typeof result?.message === "string" ? result.message : "";
  const detail = [code, message].filter(Boolean).join(": ").slice(0, 300);
  return detail ? `${fallback} Brevo: ${detail}` : fallback;
}

async function getActiveBrevoSender(configuration: BrevoConfiguration) {
  const response = await fetch("https://api.brevo.com/v3/senders", {
    method: "GET",
    headers: brevoHeaders(configuration.apiKey),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const result = await readJsonSafely(response);
  const senders = Array.isArray(result?.senders)
    ? (result.senders as BrevoSender[])
    : [];
  const sender = senders.find(
    (candidate) =>
      candidate.active &&
      candidate.email.toLowerCase() === configuration.senderEmail.toLowerCase()
  );

  if (!response.ok || !sender) {
    throw new CampaignServiceError(
      "The configured Brevo sender is not active in this Brevo account.",
      502,
      "brevo_sender_unavailable"
    );
  }

  return sender;
}

async function getBrevoContactAttributes(configuration: BrevoConfiguration) {
  const response = await fetch("https://api.brevo.com/v3/contacts/attributes", {
    method: "GET",
    headers: brevoHeaders(configuration.apiKey),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const result = await readJsonSafely(response);

  if (!response.ok || !Array.isArray(result?.attributes)) {
    throw new CampaignServiceError(
      "Brevo contact personalization is temporarily unavailable.",
      502,
      "brevo_attributes_unavailable"
    );
  }

  return result.attributes as BrevoContactAttribute[];
}

async function ensureRecipientNameAttribute(
  configuration: BrevoConfiguration
) {
  const hasRecipientName = (attributes: BrevoContactAttribute[]) =>
    attributes.some(
      (attribute) =>
        attribute.name === BREVO_RECIPIENT_NAME_ATTRIBUTE &&
        attribute.category === "normal"
    );

  if (hasRecipientName(await getBrevoContactAttributes(configuration))) return;

  const response = await fetch(
    `https://api.brevo.com/v3/contacts/attributes/normal/${BREVO_RECIPIENT_NAME_ATTRIBUTE}`,
    {
      method: "POST",
      headers: brevoHeaders(configuration.apiKey, true),
      body: JSON.stringify({ type: "text" }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    }
  );

  if (response.ok) return;

  // A concurrent preparation may have created the attribute first.
  if (hasRecipientName(await getBrevoContactAttributes(configuration))) return;

  throw new CampaignServiceError(
    "Brevo could not enable recipient-name personalization.",
    502,
    "brevo_attribute_creation_failed"
  );
}

async function getOwnedCampaign(
  supabase: SupabaseClient,
  campaignId: string,
  userId: string
) {
  const { data, error } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .eq("user_id", userId)
    .is("archived_at", null)
    .single();

  if (error || !data) {
    throw new CampaignServiceError(
      "Campaign not found.",
      404,
      "not_found",
      campaignId
    );
  }

  return data as CampaignRecord;
}

async function getSubscribedContacts(
  supabase: SupabaseClient,
  campaign: CampaignRecord
) {
  const recipientIds = campaign.recipient_contact_ids ?? [];
  if (recipientIds.length === 0) {
    throw new CampaignServiceError(
      "Select at least one subscribed recipient.",
      400,
      "no_recipients",
      campaign.id
    );
  }

  const { data, error } = await supabase
    .from("contacts")
    .select("id, full_name, company, email")
    .eq("user_id", campaign.user_id)
    .eq("status", "subscribed")
    .in("id", recipientIds);

  if (error) {
    throw new CampaignServiceError(
      "Unable to verify campaign recipients.",
      500,
      "recipient_lookup_failed",
      campaign.id
    );
  }

  if (!data || data.length !== recipientIds.length) {
    throw new CampaignServiceError(
      "Some recipients are no longer subscribed. Review the audience before preparing this campaign.",
      400,
      "recipients_changed",
      campaign.id
    );
  }

  return data as ContactRecord[];
}

async function synchronizeRecipients(
  supabase: SupabaseClient,
  campaign: CampaignRecord,
  contacts: ContactRecord[],
  configuration: BrevoConfiguration
) {
  let listId = campaign.brevo_list_id;
  const personalizeRecipients =
    campaign.message_mode === "template" &&
    campaignUsesRecipientPersonalization(campaign.html_content);

  if (personalizeRecipients) {
    await ensureRecipientNameAttribute(configuration);
  }

  if (!listId) {
    const response = await fetch("https://api.brevo.com/v3/contacts/lists", {
      method: "POST",
      headers: brevoHeaders(configuration.apiKey, true),
      body: JSON.stringify({
        folderId: 3,
        name: `EmailBlast - ${campaign.name} - ${campaign.id.slice(0, 8)}`.slice(
          0,
          64
        ),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const result = await readJsonSafely(response);

    if (!response.ok || typeof result?.id !== "number") {
      throw new CampaignServiceError(
        "Brevo could not prepare the recipient list. Try again.",
        502,
        "brevo_list_failed",
        campaign.id
      );
    }

    listId = result.id;

    const { error } = await supabase
      .from("campaigns")
      .update({ brevo_list_id: listId })
      .eq("id", campaign.id)
      .eq("user_id", campaign.user_id)
      .eq("status", "draft");

    if (error) {
      throw new CampaignServiceError(
        "The recipient list was prepared, but its reference could not be saved.",
        500,
        "list_reference_failed",
        campaign.id
      );
    }
  }

  for (const contact of contacts) {
    const response = await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: brevoHeaders(configuration.apiKey, true),
      body: JSON.stringify({
        email: contact.email,
        listIds: [Number(listId)],
        updateEnabled: true,
        ...(personalizeRecipients
          ? {
              attributes: getBrevoRecipientAttributes(contact),
            }
          : {}),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      throw new CampaignServiceError(
        "One or more recipients could not be prepared in Brevo. Try again.",
        502,
        "brevo_contact_failed",
        campaign.id
      );
    }
  }

  const listResponse = await fetch(
    `https://api.brevo.com/v3/contacts/lists/${Number(listId)}`,
    {
      method: "GET",
      headers: brevoHeaders(configuration.apiKey),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    }
  );
  const listResult = await readJsonSafely(listResponse);

  if (!listResponse.ok || typeof listResult?.totalSubscribers !== "number") {
    throw new CampaignServiceError(
      "Brevo could not verify the campaign recipients. Try again.",
      502,
      "brevo_recipient_verification_failed",
      campaign.id
    );
  }

  const expectedRecipientCount = new Set(
    contacts.map((contact) => contact.email.trim().toLowerCase())
  ).size;
  const deliverableRecipientCount = listResult.totalSubscribers;
  const deliverabilityError = getDeliverabilityError(
    expectedRecipientCount,
    deliverableRecipientCount
  );

  if (deliverabilityError) {
    await supabase
      .from("campaigns")
      .update({ brevo_synced_at: null, last_error: deliverabilityError })
      .eq("id", campaign.id)
      .eq("user_id", campaign.user_id);

    throw new CampaignServiceError(
      deliverabilityError,
      400,
      "no_deliverable_recipients",
      campaign.id
    );
  }

  const syncedAt = new Date().toISOString();
  const { error } = await supabase
    .from("campaigns")
    .update({ brevo_synced_at: syncedAt, last_error: null })
    .eq("id", campaign.id)
    .eq("user_id", campaign.user_id)
    .eq("status", "draft");

  if (error) {
    throw new CampaignServiceError(
      "Recipients were prepared, but the completion status could not be saved.",
      500,
      "sync_status_failed",
      campaign.id
    );
  }

  return Number(listId);
}

async function createBrevoDraft(
  supabase: SupabaseClient,
  campaign: CampaignRecord,
  listId: number,
  configuration: BrevoConfiguration
) {
  if (campaign.brevo_campaign_id) {
    return Number(campaign.brevo_campaign_id);
  }

  const sender = await getActiveBrevoSender(configuration);
  const requestBody = {
    name: campaign.name,
    sender: { id: sender.id },
    subject: campaign.subject,
    htmlContent: campaign.html_content,
    recipients: { listIds: [listId] },
    ...(campaign.preview_text?.trim()
      ? { previewText: campaign.preview_text.trim() }
      : {}),
  };

  const response = await fetch("https://api.brevo.com/v3/emailCampaigns", {
    method: "POST",
    headers: brevoHeaders(configuration.apiKey, true),
    body: JSON.stringify(requestBody),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const result = await readJsonSafely(response);

  if (!response.ok || typeof result?.id !== "number") {
    const errorMessage = getBrevoErrorMessage(
      result,
      "Brevo could not prepare the email draft."
    );
    await supabase
      .from("campaigns")
      .update({ last_error: errorMessage })
      .eq("id", campaign.id)
      .eq("user_id", campaign.user_id);

    throw new CampaignServiceError(
      errorMessage,
      502,
      "brevo_campaign_failed",
      campaign.id
    );
  }

  const { error } = await supabase
    .from("campaigns")
    .update({ brevo_campaign_id: result.id, last_error: null })
    .eq("id", campaign.id)
    .eq("user_id", campaign.user_id)
    .eq("status", "draft");

  if (error) {
    throw new CampaignServiceError(
      "The email was prepared, but its Brevo reference could not be saved.",
      500,
      "campaign_reference_failed",
      campaign.id
    );
  }

  return result.id;
}

export async function prepareCampaign(
  supabase: SupabaseClient,
  campaignId: string,
  userId: string
) {
  const campaign = await getOwnedCampaign(supabase, campaignId, userId);

  if (campaign.status !== "draft") {
    throw new CampaignServiceError(
      "Only a draft campaign can be prepared.",
      409,
      "not_draft",
      campaign.id
    );
  }

  if (campaign.cron_armed_at) {
    throw new CampaignServiceError(
      "Remove this campaign from its delivery batch before preparing it again.",
      409,
      "already_armed",
      campaign.id
    );
  }

  const contacts = await getSubscribedContacts(supabase, campaign);
  const configuration = getBrevoConfiguration();
  const listId = await synchronizeRecipients(
    supabase,
    campaign,
    contacts,
    configuration
  );
  await createBrevoDraft(supabase, campaign, listId, configuration);
  return { campaignId: campaign.id, prepared: true as const };
}

export async function refreshBatchAggregate(
  supabase: SupabaseClient,
  batchId: string
) {
  const { data: items, error } = await supabase
    .from("campaign_batch_items")
    .select("campaigns(status)")
    .eq("batch_id", batchId);

  if (error) {
    throw new CampaignServiceError(
      "The delivery batch status could not be checked.",
      500,
      "batch_status_lookup_failed"
    );
  }

  const statuses = items
    .map((item) => {
      const campaign = Array.isArray(item.campaigns)
        ? item.campaigns[0]
        : item.campaigns;
      return (campaign as { status?: CampaignStatus } | null)?.status;
    })
    .filter(Boolean) as CampaignStatus[];

  const nextStatus = deriveBatchAggregateStatus(statuses);
  const terminal = nextStatus !== "sending";

  const { error: updateError } = await supabase
    .from("campaign_batches")
    .update({
      status: nextStatus,
      ...(terminal ? { completed_at: new Date().toISOString() } : {}),
    })
    .eq("id", batchId)
    .eq("status", "sending");

  if (updateError) {
    throw new CampaignServiceError(
      "The delivery batch status could not be saved.",
      500,
      "batch_status_update_failed"
    );
  }

  return { batchId, status: nextStatus };
}

export async function sendClaimedCampaign(
  admin: SupabaseClient,
  campaignId: string,
  timeoutMs = 20_000,
) {
  const { data: campaign, error } = await admin
    .from("campaigns")
    .select("id, brevo_campaign_id, status")
    .eq("id", campaignId)
    .eq("status", "sending")
    .single();

  if (error || !campaign?.brevo_campaign_id) {
    await admin
      .from("campaigns")
      .update({
        status: "failed",
        last_error: "The prepared Brevo campaign reference is missing.",
      })
      .eq("id", campaignId)
      .eq("status", "sending");

    throw new CampaignServiceError(
      "The prepared campaign reference is missing.",
      409,
      "missing_brevo_campaign",
      campaignId
    );
  }

  const { apiKey } = getBrevoConfiguration();

  try {
    const response = await fetch(
      `https://api.brevo.com/v3/emailCampaigns/${campaign.brevo_campaign_id}/sendNow`,
      {
        method: "POST",
        headers: brevoHeaders(apiKey),
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      }
    );

    if (!response.ok) {
      await admin
        .from("campaigns")
        .update({
          status: "failed",
          last_error: "Brevo rejected the delivery request.",
          status_checked_at: new Date().toISOString(),
        })
        .eq("id", campaignId)
        .eq("status", "sending");

      throw new CampaignServiceError(
        "Brevo rejected the delivery request.",
        502,
        "brevo_send_rejected",
        campaignId
      );
    }

    return { campaignId, status: "sending" as const };
  } catch (error) {
    if (error instanceof CampaignServiceError) throw error;

    await admin
      .from("campaigns")
      .update({
        last_error:
          "Delivery confirmation is uncertain. EmailBlast will check Brevo before allowing another attempt.",
        status_checked_at: new Date().toISOString(),
      })
      .eq("id", campaignId)
      .eq("status", "sending");

    throw new CampaignServiceError(
      "Brevo did not confirm the request before the connection closed.",
      202,
      "brevo_send_uncertain",
      campaignId
    );
  }
}

export async function reconcileCampaignStatus(
  supabase: SupabaseClient,
  campaignId: string,
  userId?: string,
  timeoutMs = 15_000,
) {
  let query = supabase
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .is("archived_at", null);
  if (userId) query = query.eq("user_id", userId);

  const { data, error } = await query.single();
  if (error || !data) {
    throw new CampaignServiceError("Campaign not found.", 404, "not_found");
  }

  const campaign = data as CampaignRecord;
  if (campaign.status !== "sending" || !campaign.brevo_campaign_id) {
    return {
      status: campaign.status,
      sentAt: campaign.sent_at ?? null,
      terminal: campaign.status === "sent" || campaign.status === "failed",
    };
  }

  const { apiKey } = getBrevoConfiguration();
  const response = await fetch(
    `https://api.brevo.com/v3/emailCampaigns/${campaign.brevo_campaign_id}`,
    {
      method: "GET",
      headers: brevoHeaders(apiKey),
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    }
  );
  const result = await readJsonSafely(response);

  if (!response.ok || typeof result?.status !== "string") {
    throw new CampaignServiceError(
      "Brevo status is temporarily unavailable.",
      502,
      "brevo_status_unavailable",
      campaignId
    );
  }

  const mapped = mapBrevoStatus(result.status, campaign.status);
  const checkedAt = new Date().toISOString();
  const update: Record<string, string | null> = {
    status: mapped.status,
    status_checked_at: checkedAt,
    last_error: mapped.status === "failed" ? "Brevo stopped this campaign." : null,
  };

  if (mapped.status === "sent") {
    update.sent_at =
      typeof result.sentDate === "string" ? result.sentDate : checkedAt;
  }

  const updateQuery = supabase
    .from("campaigns")
    .update(update)
    .eq("id", campaignId);
  if (userId) updateQuery.eq("user_id", userId);
  const { error: updateError } = await updateQuery;

  if (updateError) {
    throw new CampaignServiceError(
      "The delivery status could not be saved.",
      500,
      "status_update_failed",
      campaignId
    );
  }

  const { data: batchItems } = await supabase
    .from("campaign_batch_items")
    .select("batch_id")
    .eq("campaign_id", campaignId);
  await Promise.all(
    (batchItems ?? []).map((item) =>
      refreshBatchAggregate(supabase, item.batch_id as string)
    )
  );

  return {
    status: mapped.status,
    sentAt: update.sent_at ?? campaign.sent_at ?? null,
    terminal: mapped.terminal,
  };
}

