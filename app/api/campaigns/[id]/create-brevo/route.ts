
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
    const senderEmail = process.env.BREVO_SENDER_EMAIL;
    const senderName = process.env.BREVO_SENDER_NAME;

    if (!apiKey || !senderEmail || !senderName) {
      return NextResponse.json(
        { error: "Missing Brevo API or sender environment variables." },
        { status: 500 }
      );
    }

    // Retrieve the campaign belonging to the logged-in user.
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
        { error: "Only draft campaigns can be created in Brevo." },
        { status: 400 }
      );
    }

    if (!campaign.brevo_synced_at) {
  return NextResponse.json(
    { error: "Please synchronize all campaign contacts with Brevo first." },
    { status: 400 }
  );
}


    if (campaign.brevo_campaign_id) {
      return NextResponse.json({
        success: true,
        message: "This campaign already exists in Brevo.",
        brevoCampaignId: campaign.brevo_campaign_id,
      });
    }

    if (!campaign.brevo_list_id) {
      return NextResponse.json(
        { error: "Please synchronize contacts with Brevo first." },
        { status: 400 }
      );
    }

    if (
      !campaign.subject?.trim() ||
      !campaign.html_content?.trim() ||
      campaign.html_content.trim().length <= 10
    ) {
      return NextResponse.json(
        { error: "Campaign subject or email content is missing." },
        { status: 400 }
      );
    }

    const recipientIds: string[] =
      campaign.recipient_contact_ids ?? [];

    if (recipientIds.length === 0) {
      return NextResponse.json(
        { error: "This campaign has no selected recipients." },
        { status: 400 }
      );
    }

    // Confirm that every selected recipient is still subscribed.
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
            "Some recipients are no longer subscribed. Please review and synchronize again.",
        },
        { status: 400 }
      );
    }

    // Create the email campaign in Brevo.
    const brevoResponse = await fetch(
      "https://api.brevo.com/v3/emailCampaigns",
      {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "api-key": apiKey,
        },
        body: JSON.stringify({
          name: campaign.name,
          sender: {
            name: senderName,
            email: senderEmail,
          },
          subject: campaign.subject,
          previewText: campaign.preview_text || "",
          htmlContent: campaign.html_content,
          recipients: {
            listIds: [Number(campaign.brevo_list_id)],
          },
        }),
        cache: "no-store",
      }
    );

    const brevoResult = await brevoResponse.json();

    if (!brevoResponse.ok) {
      console.error("Brevo campaign creation error:", brevoResult);

      return NextResponse.json(
        {
          error: "Brevo could not create the email campaign.",
          details: brevoResult,
        },
        { status: 502 }
      );
    }

    // Save the Brevo campaign ID in Supabase.
    const { error: updateError } = await supabase
      .from("campaigns")
      .update({
        brevo_campaign_id: brevoResult.id,
      })
      .eq("id", id)
      .eq("user_id", user.id);

    if (updateError) {
      console.error("Supabase campaign update error:", updateError);

      return NextResponse.json(
        {
          error: "Brevo created the draft, but Supabase could not save its ID.",
          brevoCampaignId: brevoResult.id,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Email campaign successfully created in Brevo as a draft.",
      brevoCampaignId: brevoResult.id,
    });
  } catch (error) {
    console.error("Brevo campaign creation error:", error);

    return NextResponse.json(
      { error: "Unexpected error creating the Brevo campaign." },
      { status: 500 }
    );
  }
}
