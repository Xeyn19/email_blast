
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

    if (!campaign.brevo_campaign_id) {
      return NextResponse.json(
        { error: "No Brevo campaign ID found." },
        { status: 400 }
      );
    }

    const apiKey = process.env.BREVO_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Brevo API key is missing." },
        { status: 500 }
      );
    }

    const brevoResponse = await fetch(
      `https://api.brevo.com/v3/emailCampaigns/${campaign.brevo_campaign_id}`,
      {
        method: "GET",
        headers: {
          accept: "application/json",
          "api-key": apiKey,
        },
        cache: "no-store",
      }
    );

    const brevoData = await brevoResponse.json();

    if (!brevoResponse.ok) {
      return NextResponse.json(
        {
          error: "Unable to retrieve campaign status from Brevo.",
          details: brevoData,
        },
        { status: 502 }
      );
    }

    let newStatus = campaign.status;

    if (brevoData.status === "sent") {
      newStatus = "sent";
    } else if (
      brevoData.status === "cancelled" ||
      brevoData.status === "suspended"
    ) {
      newStatus = "failed";
    } else if (
      [
        "queued",
        "in_process",
        "in_review",
        "cancelling",
      ].includes(brevoData.status)
    ) {
      newStatus = "sending";
    }

    const updateData: {
      status: string;
      sent_at?: string;
    } = {
      status: newStatus,
    };

    if (newStatus === "sent") {
      updateData.sent_at =
        brevoData.sentDate || new Date().toISOString();
    }

    const { error: updateError } = await supabase
      .from("campaigns")
      .update(updateData)
      .eq("id", id)
      .eq("user_id", user.id);

    if (updateError) {
      return NextResponse.json(
        { error: "Could not update campaign status in Supabase." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Campaign status successfully checked.",
      brevoStatus: brevoData.status,
      campaignStatus: newStatus,
      sentAt: brevoData.sentDate || null,
      statistics: brevoData.statistics?.globalStats || null,
    });
  } catch (error) {
    console.error("Campaign status check error:", error);

    return NextResponse.json(
      { error: "Unexpected error checking campaign status." },
      { status: 500 }
    );
  }
}
