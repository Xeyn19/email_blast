
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET() {
  return NextResponse.json({
    success: true,
    message: "Brevo synchronization route is working.",
  });
}

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
        { error: "Unauthorized. Please log in again." },
        { status: 401 }
      );
    }

    const apiKey = process.env.BREVO_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "BREVO_API_KEY is missing." },
        { status: 500 }
      );
    }

    const { data: campaign, error: campaignError } =
      await supabase
        .from("campaigns")
        .select(
          "id, user_id, name, recipient_contact_ids, brevo_list_id"
        )
        .eq("id", id)
        .eq("user_id", user.id)
        .single();

    if (campaignError || !campaign) {
      return NextResponse.json(
        { error: "Campaign not found." },
        { status: 404 }
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

    const { data: contacts, error: contactsError } =
      await supabase
        .from("contacts")
        .select("id, full_name, email, status")
        .eq("user_id", user.id)
        .eq("status", "subscribed")
        .in("id", recipientIds);

    if (contactsError) {
      return NextResponse.json(
        { error: "Unable to retrieve campaign recipients." },
        { status: 500 }
      );
    }

    if (!contacts || contacts.length !== recipientIds.length) {
      return NextResponse.json(
        {
          error:
            "Some selected contacts are missing or are no longer subscribed. Please review your recipients.",
          selectedCount: recipientIds.length,
          eligibleCount: contacts?.length ?? 0,
        },
        { status: 400 }
      );
    }

    // Clear the previous completion timestamp before retrying.
    const { error: resetError } = await supabase
      .from("campaigns")
      .update({ brevo_synced_at: null })
      .eq("id", id)
      .eq("user_id", user.id);

    if (resetError) {
      return NextResponse.json(
        { error: "Unable to update synchronization status." },
        { status: 500 }
      );
    }

    let brevoListId = campaign.brevo_list_id;

    // Reuse an existing Brevo list or create one.
    if (!brevoListId) {
      const listName =
        `EmailBlast - ${campaign.name} - ${id.slice(0, 8)}`.slice(
          0,
          64
        );

      const listResponse = await fetch(
        "https://api.brevo.com/v3/contacts/lists",
        {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
            "api-key": apiKey,
          },
          body: JSON.stringify({
            folderId: 3,
            name: listName,
          }),
          cache: "no-store",
        }
      );

      const listResult = await listResponse.json();

      if (!listResponse.ok) {
        console.error("Brevo list creation error:", listResult);

        return NextResponse.json(
          {
            error: "Unable to create a Brevo contact list.",
            details: listResult,
          },
          { status: 502 }
        );
      }

      brevoListId = listResult.id;

      const { error: updateError } = await supabase
        .from("campaigns")
        .update({ brevo_list_id: brevoListId })
        .eq("id", id)
        .eq("user_id", user.id);

      if (updateError) {
        return NextResponse.json(
          {
            error:
              "The Brevo list was created, but its ID could not be saved in Supabase.",
            brevoListId,
          },
          { status: 500 }
        );
      }
    }

    const successful: string[] = [];
    const failed: { email: string; reason: string }[] = [];

    for (const contact of contacts) {
      const contactResponse = await fetch(
        "https://api.brevo.com/v3/contacts",
        {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
            "api-key": apiKey,
          },
          body: JSON.stringify({
            email: contact.email,
            listIds: [Number(brevoListId)],
            updateEnabled: true,
          }),
          cache: "no-store",
        }
      );

      if (contactResponse.ok) {
        successful.push(contact.email);
      } else {
        failed.push({
          email: contact.email,
          reason: await contactResponse.text(),
        });
      }
    }

    if (failed.length > 0) {
      console.error("Brevo synchronization failures:", failed);

      return NextResponse.json(
        {
          success: false,
          message: "Some contacts could not be synchronized.",
          brevoListId,
          synchronizedCount: successful.length,
          failedCount: failed.length,
          failed,
        },
        { status: 502 }
      );
    }

    // Mark synchronization complete only after every contact succeeds.
    const syncedAt = new Date().toISOString();

    const { error: completionError } = await supabase
      .from("campaigns")
      .update({ brevo_synced_at: syncedAt })
      .eq("id", id)
      .eq("user_id", user.id);

    if (completionError) {
      console.error(
        "Unable to save synchronization completion:",
        completionError
      );

      return NextResponse.json(
        {
          error:
            "Contacts were synchronized with Brevo, but EmailBlast could not save the completion status. Please synchronize again.",
          brevoListId,
          synchronizedCount: successful.length,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Contacts successfully synchronized with Brevo.",
      campaignId: id,
      brevoListId,
      synchronizedCount: successful.length,
      syncedAt,
      contacts: successful,
    });
  } catch (error) {
    console.error("Brevo synchronization error:", error);

    return NextResponse.json(
      { error: "Unexpected error during Brevo synchronization." },
      { status: 500 }
    );
  }
}
