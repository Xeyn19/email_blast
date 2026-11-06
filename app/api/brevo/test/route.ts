
import { NextResponse } from "next/server";

export async function GET() {
  const apiKey = process.env.BREVO_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "Brevo API key is not configured." },
      { status: 500 }
    );
  }

  try {
    const response = await fetch("https://api.brevo.com/v3/account", {
      method: "GET",
      headers: {
        "api-key": apiKey,
        accept: "application/json",
      },
      cache: "no-store",
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        {
          connected: false,
          error: data?.message ?? "Brevo connection failed.",
        },
        { status: response.status }
      );
    }

    return NextResponse.json({
      connected: true,
      message: "Successfully connected to Brevo!",
      accountEmail: data?.email ?? null,
    });
  } catch {
    return NextResponse.json(
      { connected: false, error: "Unable to reach Brevo." },
      { status: 500 }
    );
  }
}
