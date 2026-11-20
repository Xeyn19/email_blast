import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const CONTACT_STATUSES = ["pending", "subscribed", "unsubscribed"] as const;
const MAX_BULK_CONTACTS = 5000;
const DATABASE_BATCH_SIZE = 200;

type ContactStatus = (typeof CONTACT_STATUSES)[number];

function isContactStatus(value: unknown): value is ContactStatus {
  return CONTACT_STATUSES.includes(value as ContactStatus);
}

function chunkContactIds(contactIds: string[]) {
  const chunks: string[][] = [];
  for (let index = 0; index < contactIds.length; index += DATABASE_BATCH_SIZE) {
    chunks.push(contactIds.slice(index, index + DATABASE_BATCH_SIZE));
  }
  return chunks;
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: "Your session has expired. Please log in again." },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "The contact status request is not valid JSON." },
      { status: 400 },
    );
  }

  const input =
    body && typeof body === "object"
      ? (body as { contactIds?: unknown; status?: unknown })
      : {};
  const contactIds = Array.isArray(input.contactIds)
    ? Array.from(
        new Set(
          input.contactIds.filter(
            (contactId): contactId is string =>
              typeof contactId === "string" && contactId.trim().length > 0,
          ),
        ),
      )
    : [];

  if (contactIds.length === 0) {
    return NextResponse.json(
      { error: "Select at least one contact to update." },
      { status: 400 },
    );
  }
  if (contactIds.length > MAX_BULK_CONTACTS) {
    return NextResponse.json(
      { error: `You can update up to ${MAX_BULK_CONTACTS} contacts at a time.` },
      { status: 400 },
    );
  }
  if (!isContactStatus(input.status)) {
    return NextResponse.json(
      { error: "Choose a valid contact status." },
      { status: 400 },
    );
  }

  const contactIdChunks = chunkContactIds(contactIds);
  let ownedContactCount = 0;

  for (const contactIdChunk of contactIdChunks) {
    const { data: ownedContacts, error: ownershipError } = await supabase
      .from("contacts")
      .select("id")
      .eq("user_id", user.id)
      .in("id", contactIdChunk);

    if (ownershipError) {
      return NextResponse.json(
        { error: "Unable to verify the selected contacts." },
        { status: 500 },
      );
    }
    ownedContactCount += ownedContacts?.length ?? 0;
  }

  if (ownedContactCount !== contactIds.length) {
    return NextResponse.json(
      { error: "One or more selected contacts could not be found." },
      { status: 404 },
    );
  }

  const updateData: {
    status: ContactStatus;
    consent_source?: string;
    consented_at?: string;
    unsubscribed_at?: string | null;
  } = { status: input.status };

  if (input.status === "subscribed") {
    updateData.consent_source = "User-confirmed permission";
    updateData.consented_at = new Date().toISOString();
    updateData.unsubscribed_at = null;
  } else if (input.status === "unsubscribed") {
    updateData.unsubscribed_at = new Date().toISOString();
  }

  let updatedCount = 0;
  for (const contactIdChunk of contactIdChunks) {
    const { data: updatedContacts, error: updateError } = await supabase
      .from("contacts")
      .update(updateData)
      .eq("user_id", user.id)
      .in("id", contactIdChunk)
      .select("id");

    if (updateError || (updatedContacts ?? []).length !== contactIdChunk.length) {
      return NextResponse.json(
        { error: "Unable to update the selected contacts." },
        { status: 500 },
      );
    }
    updatedCount += updatedContacts?.length ?? 0;
  }

  return NextResponse.json({
    success: true,
    updatedCount,
    status: input.status,
  });
}
