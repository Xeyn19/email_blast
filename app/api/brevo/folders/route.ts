
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    // Verify that the user is logged in
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized. Please log in." },
        { status: 401 }
      );
    }

    // Get the Brevo API key from server environment variables
    const apiKey = process.env.BREVO_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "BREVO_API_KEY is missing." },
        { status: 500 }
      );
    }

    // Retrieve folders from Brevo
    const brevoResponse = await fetch(
      "https://api.brevo.com/v3/contacts/folders?limit=50&offset=0",
      {
        method: "GET",
        headers: {
          accept: "application/json",
          "api-key": apiKey,
        },
        cache: "no-store",
      }
    );

    const result = await brevoResponse.json();

    if (!brevoResponse.ok) {
      return NextResponse.json(
        {
          error: "Unable to retrieve Brevo folders.",
          details: result,
        },
        { status: brevoResponse.status }
      );
    }

    // Find our EmailBlast folder
    const folder = result.folders?.find(
      (item: { id: number; name: string }) =>
        item.name === "emailblast trial"
    );

    if (!folder) {
      return NextResponse.json(
        {
          error: "emailblast trial folder was not found.",
          folders: result.folders ?? [],
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Brevo folder found successfully.",
      folderId: folder.id,
      folderName: folder.name,
    });
  } catch (error) {
    console.error("Brevo folders error:", error);

    return NextResponse.json(
      { error: "Something went wrong while retrieving Brevo folders." },
      { status: 500 }
    );
  }
}
