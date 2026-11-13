import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = {
  params: Promise<{ id: string }>;
};

type EmailTemplateRow = {
  id: string;
  name: string;
  source_filename: string;
  html_content: string;
  asset_urls: string[] | null;
  created_at: string;
  updated_at: string;
};

function serializeTemplate(template: EmailTemplateRow) {
  return {
    id: template.id,
    name: template.name,
    sourceFilename: template.source_filename,
    htmlContent: template.html_content,
    assetUrls: template.asset_urls ?? [],
    createdAt: template.created_at,
    updatedAt: template.updated_at,
  };
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;
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

  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json(
      { error: "Email template not found." },
      { status: 404 },
    );
  }

  const { data, error } = await supabase
    .from("email_templates")
    .select(
      "id, name, source_filename, html_content, asset_urls, created_at, updated_at",
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "Unable to load the email template." },
      { status: 500 },
    );
  }

  if (!data) {
    return NextResponse.json(
      { error: "Email template not found." },
      { status: 404 },
    );
  }

  return NextResponse.json({
    template: serializeTemplate(data as EmailTemplateRow),
  });
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { id } = await params;
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

  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json(
      { error: "Email template not found." },
      { status: 404 },
    );
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("email_templates")
    .update({ archived_at: now, updated_at: now })
    .eq("id", id)
    .eq("user_id", user.id)
    .is("archived_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "Unable to archive the email template." },
      { status: 500 },
    );
  }

  if (!data) {
    return NextResponse.json(
      { error: "Email template not found." },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true, templateId: id });
}
