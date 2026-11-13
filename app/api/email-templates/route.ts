import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  EmailTemplateProcessingError,
  processHtmlTemplate,
  validateHtmlTemplateFile,
} from "@/lib/email-templates/processor";
import { createClient } from "@/lib/supabase/server";

const ASSET_BUCKET = "email-template-assets";

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

export async function GET() {
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

  const { data, error } = await supabase
    .from("email_templates")
    .select(
      "id, name, source_filename, html_content, asset_urls, created_at, updated_at",
    )
    .eq("user_id", user.id)
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "Unable to load email templates." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    templates: ((data ?? []) as EmailTemplateRow[]).map(serializeTemplate),
  });
}

export async function POST(request: Request) {
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

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Upload a valid multipart form with a template name and HTML file." },
      { status: 400 },
    );
  }

  const rawName = formData.get("name");
  const uploadedFile = formData.get("file");
  const name = typeof rawName === "string" ? rawName.trim() : "";

  if (!name) {
    return NextResponse.json(
      { error: "Enter a template name." },
      { status: 400 },
    );
  }

  if (name.length > 120) {
    return NextResponse.json(
      { error: "Template names must be 120 characters or fewer." },
      { status: 400 },
    );
  }

  if (!(uploadedFile instanceof File)) {
    return NextResponse.json(
      { error: "Choose an HTML template file." },
      { status: 400 },
    );
  }

  const { data: duplicate, error: duplicateError } = await supabase
    .from("email_templates")
    .select("id")
    .eq("user_id", user.id)
    .is("archived_at", null)
    .eq("name", name)
    .maybeSingle();

  if (duplicateError) {
    return NextResponse.json(
      { error: "Unable to check the template name." },
      { status: 500 },
    );
  }

  if (duplicate) {
    return NextResponse.json(
      { error: "An active email template already uses this name." },
      { status: 409 },
    );
  }

  const templateId = randomUUID();
  const uploadedPaths: string[] = [];

  async function removeUploadedAssets() {
    if (uploadedPaths.length > 0) {
      await supabase.storage.from(ASSET_BUCKET).remove(uploadedPaths);
    }
  }

  try {
    validateHtmlTemplateFile({
      name: uploadedFile.name,
      size: uploadedFile.size,
    });

    const html = await uploadedFile.text();
    const processed = await processHtmlTemplate({
      filename: uploadedFile.name,
      html,
      uploadEmbeddedImage: async (asset) => {
        const path = `${user.id}/${templateId}/${asset.index}-${asset.filename}`;
        const { error: uploadError } = await supabase.storage
          .from(ASSET_BUCKET)
          .upload(path, asset.bytes, {
            cacheControl: "31536000",
            contentType: asset.mimeType,
            upsert: false,
          });

        if (uploadError) {
          throw new Error("Unable to upload an embedded template image.");
        }

        uploadedPaths.push(path);
        const { data } = supabase.storage.from(ASSET_BUCKET).getPublicUrl(path);
        return data.publicUrl;
      },
    });

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("email_templates")
      .insert({
        id: templateId,
        user_id: user.id,
        name,
        source_filename: uploadedFile.name,
        html_content: processed.sanitizedHtml,
        asset_urls: processed.assets.map((asset) => asset.url),
        created_at: now,
        updated_at: now,
      })
      .select(
        "id, name, source_filename, html_content, asset_urls, created_at, updated_at",
      )
      .single();

    if (error || !data) {
      await removeUploadedAssets();

      if (error?.code === "23505") {
        return NextResponse.json(
          { error: "An active email template already uses this name." },
          { status: 409 },
        );
      }

      return NextResponse.json(
        { error: "Unable to save the email template." },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { template: serializeTemplate(data as EmailTemplateRow) },
      { status: 201 },
    );
  } catch (error) {
    await removeUploadedAssets();

    if (error instanceof EmailTemplateProcessingError) {
      const status =
        error.code === "asset_upload_failed" ||
        error.code === "unsafe_uploaded_url"
          ? 500
          : 400;

      return NextResponse.json(
        { error: error.message, code: error.code },
        { status },
      );
    }

    return NextResponse.json(
      { error: "Unable to process the uploaded email template." },
      { status: 500 },
    );
  }
}
