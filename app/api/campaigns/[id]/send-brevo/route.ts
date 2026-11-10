
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(
  _request: Request,
  { params }: RouteContext
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    // Verify the logged-in user.
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Please log in again." },
        { status: 401 }
      );
    }

    const apiKey = process.env.BREVO_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Brevo API key is missing." },
        { status: 500 }
      );
    }

    // Retrieve this user's campaign.
    const { data: campaign, error } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (error || !campaign) {
      return NextResponse.json(
        { error: "Campaign not found." },
        { status: 404 }
      );
    }

    if (campaign.status !== "draft") {
      return NextResponse.json(
        { error: "This campaign is not available to send. It may already be sending or sent." },
        { status: 409 }
      );
    }

 if (!campaign.brevo_synced_at) {
  return NextResponse.json(
    { error: "Contact synchronization must succeed before sending." },
    { status: 400 }
  );
}

    if (!campaign.brevo_campaign_id) {
      return NextResponse.json(
        { error: "Please create the email draft in Brevo first." },
        { status: 400 }
      );
    }

    if (!campaign.brevo_list_id) {
      return NextResponse.json(
        { error: "The campaign has no synchronized Brevo recipient list." },
        { status: 400 }
      );
    }

    const recipientIds: string[] =
      campaign.recipient_contact_ids ?? [];

    if (recipientIds.length === 0) {
      return NextResponse.json(
        { error: "This campaign has no recipients." },
        { status: 400 }
      );
    }

    // Verify every recipient is still subscribed.
    const { data: contacts, error: contactsError } =
      await supabase
        .from("contacts")
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "subscribed")
        .in("id", recipientIds);

    if (
      contactsError ||
      !contacts ||
      contacts.length !== recipientIds.length
    ) {
      return NextResponse.json(
        {
          error:
            "Some recipients are no longer subscribed. Please review the recipients before sending.",
        },
        { status: 400 }
      );
    }

    // Lock the campaign to prevent duplicate send requests.
    const { data: lockedCampaign, error: lockError } =
      await supabase
        .from("campaigns")
        .update({ status: "sending" })
        .eq("id", id)
        .eq("user_id", user.id)
        .eq("status", "draft")
        .select("id")
        .maybeSingle();

    if (lockError || !lockedCampaign) {
      return NextResponse.json(
        {
          error:
            "The campaign could not be locked for sending. Please refresh and check its status.",
        },
        { status: 409 }
      );
    }

    // Ask Brevo to send the prepared campaign.
    const brevoResponse = await fetch(
      `https://api.brevo.com/v3/emailCampaigns/${campaign.brevo_campaign_id}/sendNow`,
      {
        method: "POST",
        headers: {
          accept: "application/json",
          "api-key": apiKey,
        },
        cache: "no-store",
      }
    );

    const responseText = await brevoResponse.text();

    if (!brevoResponse.ok) {
      console.error("Brevo send error:", responseText);

      // Restore the draft status if Brevo rejected the request.
      await supabase
        .from("campaigns")
        .update({ status: "draft" })
        .eq("id", id)
        .eq("user_id", user.id)
        .eq("status", "sending");

      return NextResponse.json(
        {
          error: "Brevo rejected the send request. The campaign remains a draft.",
          details: responseText,
        },
        { status: 502 }
      );
    }

    // Keep the status as "sending" until delivery is confirmed.
    return NextResponse.json({
      success: true,
      message:
        "Brevo accepted the send request. The campaign is now being processed.",
      brevoCampaignId: campaign.brevo_campaign_id,
      status: "sending",
    });
  } catch (error) {
    console.error("Campaign sending error:", error);

    return NextResponse.json(
      { error: "Unexpected error while sending the campaign." },
      { status: 500 }
    );
  }
}
