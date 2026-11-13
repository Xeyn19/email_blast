import { describe, expect, it, vi } from "vitest";
import {
  BREVO_RECIPIENT_NAME_TOKEN,
  EmailTemplateProcessingError,
  MAX_HTML_TEMPLATE_BYTES,
  compileTemplateForBrevo,
  isSupportedHtmlTemplateFilename,
  processHtmlTemplate,
  renderTemplatePreview,
  sanitizeEmailTemplateHtml,
  validateHtmlTemplateFile,
  validateRecipientNameTokens,
} from "./processor";

function expectProcessingError(
  action: () => unknown,
  code: EmailTemplateProcessingError["code"]
) {
  try {
    action();
    throw new Error("Expected EmailTemplateProcessingError");
  } catch (error) {
    expect(error).toBeInstanceOf(EmailTemplateProcessingError);
    expect((error as EmailTemplateProcessingError).code).toBe(code);
  }
}

describe("HTML template file validation", () => {
  it("accepts .html and .htm names case-insensitively", () => {
    expect(isSupportedHtmlTemplateFilename("campaign.html")).toBe(true);
    expect(isSupportedHtmlTemplateFilename("campaign.HTM")).toBe(true);
    expect(isSupportedHtmlTemplateFilename("campaign.HtMl")).toBe(true);
    expect(isSupportedHtmlTemplateFilename("campaign.html.txt")).toBe(false);
  });

  it("allows exactly 5 MB and rejects a larger file", () => {
    expect(() =>
      validateHtmlTemplateFile({
        name: "campaign.html",
        size: MAX_HTML_TEMPLATE_BYTES,
      })
    ).not.toThrow();

    expectProcessingError(
      () =>
        validateHtmlTemplateFile({
          name: "campaign.html",
          size: MAX_HTML_TEMPLATE_BYTES + 1,
        }),
      "file_too_large"
    );
  });

  it("rejects unsupported extensions and invalid sizes", () => {
    expectProcessingError(
      () => validateHtmlTemplateFile({ name: "campaign.svg", size: 10 }),
      "unsupported_extension"
    );
    expectProcessingError(
      () => validateHtmlTemplateFile({ name: "campaign.html", size: -1 }),
      "invalid_file_size"
    );
  });
});

describe("recipient token validation and rendering", () => {
  it("allows no token but validates the exact token when present", () => {
    expect(() =>
      validateRecipientNameTokens("<p>Hello {{recipient_name}}</p>")
    ).not.toThrow();
    expect(() => validateRecipientNameTokens("<p>Hello</p>")).not.toThrow();
    expectProcessingError(
      () => validateRecipientNameTokens("<p>{{ recipient_name }}</p>"),
      "unknown_template_token"
    );
    expectProcessingError(
      () => validateRecipientNameTokens("<p>{{company}}</p>"),
      "unknown_template_token"
    );
    expectProcessingError(
      () => validateRecipientNameTokens("<p>{{recipient_name}</p>"),
      "malformed_template_token"
    );
    expectProcessingError(
      () => validateRecipientNameTokens("<p>{{recipient_name}}}</p>"),
      "malformed_template_token"
    );
  });

  it("rejects recipient tokens inside HTML attributes", () => {
    expectProcessingError(
      () =>
        validateRecipientNameTokens(
          '<a title="{{recipient_name}}">Open</a>'
        ),
      "recipient_token_in_attribute"
    );
  });

  it("compiles for Brevo and safely renders a local preview", () => {
    const html = "<p>Hello {{recipient_name}}, {{recipient_name}}!</p>";
    expect(compileTemplateForBrevo(html)).toBe(
      `<p>Hello ${BREVO_RECIPIENT_NAME_TOKEN}, ${BREVO_RECIPIENT_NAME_TOKEN}!</p>`
    );
    expect(renderTemplatePreview(html, '<Admin & "Owner">')).toBe(
      "<p>Hello &lt;Admin &amp; &quot;Owner&quot;&gt;, &lt;Admin &amp; &quot;Owner&quot;&gt;!</p>"
    );
  });

  it("leaves a template without a placeholder or a literal name unchanged", () => {
    const html = "<p>Good day Wendy's,</p>";
    expect(compileTemplateForBrevo(html)).toBe(html);
    expect(renderTemplatePreview(html, "Edgar Orosa")).toBe(html);
  });
});

describe("email HTML sanitization", () => {
  it("preserves email tables, inline styles, and safe images", () => {
    const sanitized = sanitizeEmailTemplateHtml(
      '<table width="640" cellpadding="0" style="background:#fff;padding:10px"><tr><td><img src="https://cdn.example.com/logo.png" width="120" style="display:block"></td></tr></table><p>{{recipient_name}}</p>'
    );

    expect(sanitized).toContain("<table");
    expect(sanitized).toContain('cellpadding="0"');
    expect(sanitized).toContain("background:#fff");
    expect(sanitized).toContain("https://cdn.example.com/logo.png");
  });

  it("removes unsafe tags, attributes, URL schemes, and CSS declarations", () => {
    const sanitized = sanitizeEmailTemplateHtml(
      '<script>alert(1)</script><iframe src="https://evil.example"></iframe><a href="javascript:alert(1)" onclick="alert(1)" style="color:red;background:url(javascript:alert(1));width:100px">Open</a><img src="https://cdn.example.com/a.png" onerror="alert(1)"><p>{{recipient_name}}</p>'
    );

    expect(sanitized).not.toContain("<script");
    expect(sanitized).not.toContain("<iframe");
    expect(sanitized).not.toContain("onclick");
    expect(sanitized).not.toContain("onerror");
    expect(sanitized).not.toContain("javascript:");
    expect(sanitized).toContain("color:red");
    expect(sanitized).toContain("width:100px");
  });
});

describe("embedded image processing", () => {
  it("processes a template without recipient personalization", async () => {
    const html = "<p>Dear Valued Partner,</p>";
    const result = await processHtmlTemplate({
      filename: "campaign.html",
      html,
      uploadEmbeddedImage: vi.fn(),
    });

    expect(result.sanitizedHtml).toBe(html);
    expect(result.brevoHtml).toBe(html);
    expect(result.assets).toEqual([]);
  });

  it.each([
    ["image/jpeg", "jpg"],
    ["image/png", "png"],
    ["image/webp", "webp"],
  ] as const)("uploads and rewrites a %s data image", async (mimeType, extension) => {
    const upload = vi.fn(async (asset) => {
      expect(asset.mimeType).toBe(mimeType);
      expect(asset.filename).toBe(`embedded-image-1.${extension}`);
      expect([...asset.bytes]).toEqual([72, 101, 108, 108, 111]);
      return `https://assets.example.com/${asset.filename}`;
    });

    const result = await processHtmlTemplate({
      filename: "campaign.html",
      html: `<p>Hello {{recipient_name}}</p><img alt="inline" src="data:${mimeType};base64,SGVsbG8=">`,
      uploadEmbeddedImage: upload,
    });

    expect(upload).toHaveBeenCalledTimes(1);
    expect(result.sanitizedHtml).toContain(
      `src="https://assets.example.com/embedded-image-1.${extension}"`
    );
    expect(result.sanitizedHtml).not.toContain("data:image");
    expect(result.assets).toEqual([
      {
        index: 0,
        filename: `embedded-image-1.${extension}`,
        mimeType,
        byteLength: 5,
        url: `https://assets.example.com/embedded-image-1.${extension}`,
      },
    ]);
    expect(result.brevoHtml).toContain(BREVO_RECIPIENT_NAME_TOKEN);
  });

  it("uploads a repeated data image only once", async () => {
    const upload = vi.fn(async () => "https://assets.example.com/image.png");
    const image = '<img src="data:image/png;base64,SGVsbG8=">';

    const result = await processHtmlTemplate({
      filename: "campaign.htm",
      html: `<p>{{recipient_name}}</p>${image}${image}`,
      uploadEmbeddedImage: upload,
    });

    expect(upload).toHaveBeenCalledTimes(1);
    expect(result.assets).toHaveLength(1);
    expect(result.sanitizedHtml.match(/assets\.example\.com/g)).toHaveLength(2);
  });

  it("rejects unsupported images, invalid base64, and unsafe upload URLs", async () => {
    await expect(
      processHtmlTemplate({
        filename: "campaign.html",
        html: '<p>{{recipient_name}}</p><img src="data:image/svg+xml;base64,PHN2Zz4=">',
        uploadEmbeddedImage: async () => "https://assets.example.com/image.svg",
      })
    ).rejects.toMatchObject({ code: "unsupported_embedded_image" });

    await expect(
      processHtmlTemplate({
        filename: "campaign.html",
        html: '<p>{{recipient_name}}</p><img src="data:image/png;base64,not-base64">',
        uploadEmbeddedImage: async () => "https://assets.example.com/image.png",
      })
    ).rejects.toMatchObject({ code: "invalid_embedded_image" });

    await expect(
      processHtmlTemplate({
        filename: "campaign.html",
        html: '<p>{{recipient_name}}</p><img src="data:image/png;base64,SGVsbG8=">',
        uploadEmbeddedImage: async () => "javascript:alert(1)",
      })
    ).rejects.toMatchObject({ code: "unsafe_uploaded_url" });
  });
});
