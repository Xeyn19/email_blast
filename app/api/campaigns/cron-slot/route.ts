import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  try {
    const admin = createAdminClient();
    const { data: batch, error: slotError } = await admin
      .from("campaign_batches")
      .select("id, user_id, name, armed_at, campaign_batch_items(count)")
      .eq("status", "waiting")
      .not("armed_at", "is", null)
      .maybeSingle();
    if (slotError) throw slotError;

    return NextResponse.json({
      available: !batch,
      batch: batch?.user_id === user.id ? {
        id: batch.id,
        name: batch.name,
        itemCount: Number(batch.campaign_batch_items?.[0]?.count ?? 0),
        armedAt: batch.armed_at,
      } : null,
      campaign: null,
    });
  } catch {
    return NextResponse.json({ error: "Unable to check the cron slot." }, { status: 500 });
  }
}

