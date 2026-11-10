import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
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
  recipient_contact_ids: string[] | null;
  status: CampaignStatus;
  brevo_list_id: number | string | null;
  brevo_campaign_id: number | string | null;
  brevo_synced_at: string | null;
  cron_armed_at: string | null;
  sent_at?: string | null;
};

type ContactRecord = {
  id: string;
  full_name: string | null;
  email: string;
};

type BrevoConfiguration = {
  apiKey: string;
  senderEmail: string;
  senderName: string;
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
    .select("id, full_name, email")
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

  const response = await fetch("https://api.brevo.com/v3/emailCampaigns", {
    method: "POST",
    headers: brevoHeaders(configuration.apiKey, true),
    body: JSON.stringify({
      name: campaign.name,
      sender: {
        name: configuration.senderName,
        email: configuration.senderEmail,
      },
      subject: campaign.subject,
      previewText: campaign.preview_text || "",
      htmlContent: campaign.html_content,
      recipients: { listIds: [listId] },
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const result = await readJsonSafely(response);

  if (!response.ok || typeof result?.id !== "number") {
    throw new CampaignServiceError(
      "Brevo could not prepare the email draft. Try again.",
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

export async function prepareAndArmCampaign(
  supabase: SupabaseClient,
  campaignId: string,
  userId: string
) {
  const campaign = await getOwnedCampaign(supabase, campaignId, userId);

  if (campaign.status !== "draft") {
    throw new CampaignServiceError(
      "Only a draft campaign can be prepared for cron.",
      409,
      "not_draft",
      campaign.id
    );
  }

  if (campaign.cron_armed_at) {
    return { campaignId: campaign.id, armedAt: campaign.cron_armed_at };
  }

  const admin = createAdminClient();
  const { data: occupiedSlot } = await admin
    .from("campaigns")
    .select("id, user_id, name")
    .not("cron_armed_at", "is", null)
    .eq("status", "draft")
    .neq("id", campaign.id)
    .maybeSingle();

  if (occupiedSlot) {
    throw new CampaignServiceError(
      occupiedSlot.user_id === userId
        ? `“${occupiedSlot.name}” is already waiting for cron. Remove it before preparing another campaign.`
        : "Another campaign is already waiting for cron.",
      409,
      "cron_slot_occupied",
      occupiedSlot.user_id === userId ? occupiedSlot.id : campaign.id
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

  const armedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("campaigns")
    .update({ cron_armed_at: armedAt, last_error: null })
    .eq("id", campaign.id)
    .eq("user_id", userId)
    .eq("status", "draft")
    .is("cron_armed_at", null)
    .select("id, cron_armed_at")
    .maybeSingle();

  if (error?.code === "23505") {
    throw new CampaignServiceError(
      "Another campaign entered the cron slot first. Remove it before trying again.",
      409,
      "cron_slot_occupied",
      campaign.id
    );
  }

  if (error || !data) {
    throw new CampaignServiceError(
      "The campaign was prepared but could not be armed for cron.",
      409,
      "arm_failed",
      campaign.id
    );
  }

  return { campaignId: campaign.id, armedAt: data.cron_armed_at as string };
}

export async function sendClaimedCampaign(
  admin: SupabaseClient,
  campaignId: string
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
        signal: AbortSignal.timeout(20_000),
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
  userId?: string
) {
  let query = supabase.from("campaigns").select("*").eq("id", campaignId);
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
      signal: AbortSignal.timeout(15_000),
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

  return {
    status: mapped.status,
    sentAt: update.sent_at ?? campaign.sent_at ?? null,
    terminal: mapped.terminal,
  };
}

