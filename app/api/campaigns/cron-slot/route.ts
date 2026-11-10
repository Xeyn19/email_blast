import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  try {
    const admin = createAdminClient();
    const { data: campaign, error: slotError } = await admin
      .from("campaigns")
      .select("id, user_id, name, cron_armed_at")
      .not("cron_armed_at", "is", null)
      .eq("status", "draft")
      .maybeSingle();
    if (slotError) throw slotError;

    return NextResponse.json({
      available: !campaign,
      campaign: campaign?.user_id === user.id ? { id: campaign.id, name: campaign.name, armedAt: campaign.cron_armed_at } : null,
    });
  } catch {
    return NextResponse.json({ error: "Unable to check the cron slot." }, { status: 500 });
  }
}

