import sanitizeHtml from "sanitize-html";
import {
  deriveTemplateMetadata,
  type EmailTemplateMetadata,
} from "./metadata";
import {
  RECIPIENT_NAME_TOKEN,
  compileRecipientToken,
  renderRecipientPreview,
} from "./tokens";

export { BREVO_RECIPIENT_NAME_TOKEN, RECIPIENT_NAME_TOKEN } from "./tokens";
export { deriveTemplateMetadata } from "./metadata";

export const MAX_HTML_TEMPLATE_BYTES = 5 * 1024 * 1024;

const HTML_EXTENSION_PATTERN = /\.html?$/i;
const MUSTACHE_TOKEN_PATTERN = /{{[\s\S]*?}}/g;
const IMAGE_TAG_PATTERN = /<img\b[^>]*>/gi;
const IMAGE_SOURCE_PATTERN = /\bsrc\s*=\s*(?:(["'])([\s\S]*?)\1|([^\s>]+))/i;
const SUPPORTED_IMAGE_DATA_PATTERN =
  /^data:(image\/(?:jpeg|png|webp));base64,([\s\S]*)$/i;
const ANY_IMAGE_DATA_PATTERN = /^data:image\//i;

const ALLOWED_TAGS = [
  "a",
  "abbr",
  "address",
  "b",
  "blockquote",
  "body",
  "br",
  "caption",
  "center",
  "cite",
  "code",
  "col",
  "colgroup",
  "dd",
  "del",
  "div",
  "dl",
  "dt",
  "em",
  "font",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "head",
  "hr",
  "html",
  "i",
  "img",
  "li",
  "ol",
  "p",
  "pre",
  "s",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
] as const;

const COMMON_ATTRIBUTES = [
  "align",
  "aria-label",
  "bgcolor",
  "class",
  "dir",
  "height",
  "id",
  "lang",
  "role",
  "style",
  "title",
  "valign",
  "width",
];

export type HtmlTemplateFileMetadata = {
  name: string;
  size: number;
};

export type EmbeddedImageMimeType =
  | "image/jpeg"
  | "image/png"
  | "image/webp";

export type EmbeddedImageUpload = {
  index: number;
  filename: string;
  mimeType: EmbeddedImageMimeType;
  bytes: Uint8Array;
};

export type ProcessedEmbeddedImage = Omit<EmbeddedImageUpload, "bytes"> & {
  byteLength: number;
  url: string;
};

export type UploadEmbeddedImage = (
  asset: EmbeddedImageUpload
) => Promise<string>;

export type ProcessHtmlTemplateInput = {
  filename: string;
  templateName?: string;
  html: string;
  uploadEmbeddedImage: UploadEmbeddedImage;
};

export type ProcessedHtmlTemplate = {
  sanitizedHtml: string;
  brevoHtml: string;
  assets: ProcessedEmbeddedImage[];
  metadata: EmailTemplateMetadata;
};

export type EmailTemplateProcessingErrorCode =
  | "invalid_file_name"
  | "invalid_file_size"
  | "unsupported_extension"
  | "file_too_large"
  | "unknown_template_token"
  | "malformed_template_token"
  | "recipient_token_in_attribute"
  | "unsupported_embedded_image"
  | "invalid_embedded_image"
  | "asset_upload_failed"
  | "unsafe_uploaded_url";

export class EmailTemplateProcessingError extends Error {
  constructor(
    message: string,
    readonly code: EmailTemplateProcessingErrorCode,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "EmailTemplateProcessingError";
  }
}

export function isSupportedHtmlTemplateFilename(filename: string) {
  return HTML_EXTENSION_PATTERN.test(filename.trim());
}

export function validateHtmlTemplateFile({
  name,
  size,
}: HtmlTemplateFileMetadata) {
  if (!name.trim()) {
    throw new EmailTemplateProcessingError(
      "The template file name is required.",
      "invalid_file_name"
    );
  }

  if (!isSupportedHtmlTemplateFilename(name)) {
    throw new EmailTemplateProcessingError(
      "Upload an .html or .htm file.",
      "unsupported_extension"
    );
  }

  if (!Number.isSafeInteger(size) || size < 0) {
    throw new EmailTemplateProcessingError(
      "The template file size is invalid.",
      "invalid_file_size"
    );
  }

  if (size > MAX_HTML_TEMPLATE_BYTES) {
    throw new EmailTemplateProcessingError(
      "The HTML template must be 5 MB or smaller.",
      "file_too_large"
    );
  }
}

export function validateRecipientNameTokens(html: string) {
  const tokens = [...html.matchAll(MUSTACHE_TOKEN_PATTERN)];

  for (const token of tokens) {
    if (token[0] !== RECIPIENT_NAME_TOKEN) {
      throw new EmailTemplateProcessingError(
        `Unknown template token: ${token[0]}`,
        "unknown_template_token"
      );
    }

    const tokenIndex = token.index ?? -1;
    if (
      html[tokenIndex - 1] === "{" ||
      html[tokenIndex + token[0].length] === "}"
    ) {
      throw new EmailTemplateProcessingError(
        `Use the exact ${RECIPIENT_NAME_TOKEN} token with two opening and two closing braces.`,
        "malformed_template_token"
      );
    }

    if (
      tokenIndex >= 0 &&
      html.lastIndexOf("<", tokenIndex) > html.lastIndexOf(">", tokenIndex)
    ) {
      throw new EmailTemplateProcessingError(
        "The recipient name token must be placed in visible email text, not inside an HTML tag or attribute.",
        "recipient_token_in_attribute"
      );
    }
  }

  const withoutValidTokens = html.split(RECIPIENT_NAME_TOKEN).join("");
  if (
    withoutValidTokens.includes("{{") ||
    withoutValidTokens.includes("}}") ||
    withoutValidTokens.includes("recipient_name")
  ) {
    throw new EmailTemplateProcessingError(
      `Use the exact ${RECIPIENT_NAME_TOKEN} token and close both braces.`,
      "malformed_template_token"
    );
  }

}

export function sanitizeEmailTemplateHtml(html: string) {
  return sanitizeHtml(html, {
    allowedTags: [...ALLOWED_TAGS],
    allowedAttributes: {
      "*": COMMON_ATTRIBUTES,
      a: [...COMMON_ATTRIBUTES, "href", "rel", "target"],
      blockquote: [...COMMON_ATTRIBUTES, "cite"],
      col: [...COMMON_ATTRIBUTES, "span"],
      colgroup: [...COMMON_ATTRIBUTES, "span"],
      font: [...COMMON_ATTRIBUTES, "color", "face", "size"],
      img: [
        ...COMMON_ATTRIBUTES,
        "alt",
        "border",
        "hspace",
        "src",
        "vspace",
      ],
      ol: [...COMMON_ATTRIBUTES, "reversed", "start", "type"],
      table: [
        ...COMMON_ATTRIBUTES,
        "border",
        "cellpadding",
        "cellspacing",
        "summary",
      ],
      td: [...COMMON_ATTRIBUTES, "colspan", "headers", "rowspan", "scope"],
      th: [...COMMON_ATTRIBUTES, "colspan", "headers", "rowspan", "scope"],
      ul: [...COMMON_ATTRIBUTES, "type"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel", "cid"],
    allowedSchemesByTag: {
      img: ["http", "https", "cid"],
    },
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
    transformTags: {
      "*": (tagName, attributes) => {
        const transformed = { ...attributes };

        if (transformed.style) {
          const safeStyle = sanitizeInlineStyle(transformed.style);
          if (safeStyle) transformed.style = safeStyle;
          else delete transformed.style;
        }

        if (tagName === "a" && transformed.target === "_blank") {
          transformed.rel = "noopener noreferrer";
        }

        return { tagName, attribs: transformed };
      },
    },
  });
}

export function compileTemplateForBrevo(html: string) {
  validateRecipientNameTokens(html);
  return compileRecipientToken(html);
}

export function renderTemplatePreview(
  html: string,
  recipientName: string,
  fallbackName = "Recipient"
) {
  validateRecipientNameTokens(html);
  return renderRecipientPreview(html, recipientName.trim() || fallbackName);
}

export async function processHtmlTemplate({
  filename,
  templateName,
  html,
  uploadEmbeddedImage,
}: ProcessHtmlTemplateInput): Promise<ProcessedHtmlTemplate> {
  const byteLength = Buffer.byteLength(html, "utf8");
  validateHtmlTemplateFile({ name: filename, size: byteLength });
  validateRecipientNameTokens(html);
  const hadRecipientNameToken = html.includes(RECIPIENT_NAME_TOKEN);

  const extracted = await extractAndUploadEmbeddedImages(
    html,
    uploadEmbeddedImage
  );
  const sanitizedHtml = sanitizeEmailTemplateHtml(extracted.html);

  validateRecipientNameTokens(sanitizedHtml);
  if (
    hadRecipientNameToken &&
    !sanitizedHtml.includes(RECIPIENT_NAME_TOKEN)
  ) {
    throw new EmailTemplateProcessingError(
      "The recipient name token must be placed in visible email content.",
      "recipient_token_in_attribute"
    );
  }

  return {
    sanitizedHtml,
    brevoHtml: compileTemplateForBrevo(sanitizedHtml),
    assets: extracted.assets,
    metadata: deriveTemplateMetadata(
      html,
      templateName?.trim() || filename.replace(/\.html?$/i, ""),
    ),
  };
}

async function extractAndUploadEmbeddedImages(
  html: string,
  uploadEmbeddedImage: UploadEmbeddedImage
) {
  const assets: ProcessedEmbeddedImage[] = [];
  const uploadedByDataUrl = new Map<
    string,
    { url: string; asset: ProcessedEmbeddedImage }
  >();
  let rewritten = "";
  let cursor = 0;

  for (const tagMatch of html.matchAll(IMAGE_TAG_PATTERN)) {
    const tagIndex = tagMatch.index ?? 0;
    const tag = tagMatch[0];
    rewritten += html.slice(cursor, tagIndex);
    cursor = tagIndex + tag.length;

    const sourceMatch = tag.match(IMAGE_SOURCE_PATTERN);
    const source = sourceMatch?.[2] ?? sourceMatch?.[3];

    if (!source || !source.toLowerCase().startsWith("data:")) {
      rewritten += tag;
      continue;
    }

    const supportedMatch = source.match(SUPPORTED_IMAGE_DATA_PATTERN);
    if (!supportedMatch) {
      throw new EmailTemplateProcessingError(
        ANY_IMAGE_DATA_PATTERN.test(source)
          ? "Embedded images must be JPEG, PNG, or WebP."
          : "Embedded image URLs must use a supported image data URL.",
        "unsupported_embedded_image"
      );
    }

    const mimeType = supportedMatch[1].toLowerCase() as EmbeddedImageMimeType;
    const base64 = supportedMatch[2].replace(/\s/g, "");
    const bytes = decodeBase64Image(base64);
    const dataKey = `${mimeType}:${base64}`;
    let uploaded = uploadedByDataUrl.get(dataKey);

    if (!uploaded) {
      const index = assets.length;
      const filename = `embedded-image-${index + 1}.${extensionFor(mimeType)}`;
      let url: string;

      try {
        url = await uploadEmbeddedImage({
          index,
          filename,
          mimeType,
          bytes,
        });
      } catch (error) {
        throw new EmailTemplateProcessingError(
          "An embedded image could not be uploaded.",
          "asset_upload_failed",
          { cause: error }
        );
      }

      assertSafeUploadedUrl(url);
      const asset: ProcessedEmbeddedImage = {
        index,
        filename,
        mimeType,
        byteLength: bytes.byteLength,
        url,
      };
      assets.push(asset);
      uploaded = { url, asset };
      uploadedByDataUrl.set(dataKey, uploaded);
    }

    const valueStart = sourceMatch?.[2] !== undefined ? 2 : 3;
    const originalValue = sourceMatch?.[valueStart] ?? source;
    const sourceAttribute = sourceMatch?.[0] ?? "";
    const rewrittenAttribute = sourceAttribute.replace(
      originalValue,
      uploaded.url
    );
    rewritten += tag.replace(sourceAttribute, rewrittenAttribute);
  }

  rewritten += html.slice(cursor);
  return { html: rewritten, assets };
}

function decodeBase64Image(base64: string) {
  if (
    base64.length === 0 ||
    base64.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)
  ) {
    throw new EmailTemplateProcessingError(
      "An embedded image contains invalid base64 data.",
      "invalid_embedded_image"
    );
  }

  const bytes = Buffer.from(base64, "base64");
  const normalizedInput = base64.replace(/=+$/, "");
  const normalizedOutput = bytes.toString("base64").replace(/=+$/, "");
  if (normalizedInput !== normalizedOutput) {
    throw new EmailTemplateProcessingError(
      "An embedded image contains invalid base64 data.",
      "invalid_embedded_image"
    );
  }

  return new Uint8Array(bytes);
}

function extensionFor(mimeType: EmbeddedImageMimeType) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  return "webp";
}

function assertSafeUploadedUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new EmailTemplateProcessingError(
      "The embedded image uploader returned an invalid URL.",
      "unsafe_uploaded_url"
    );
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new EmailTemplateProcessingError(
      "The embedded image uploader must return an HTTP or HTTPS URL.",
      "unsafe_uploaded_url"
    );
  }
}

function sanitizeInlineStyle(style: string) {
  const withoutComments = style.replace(/\/\*[\s\S]*?\*\//g, "");
  const declarations: string[] = [];

  for (const declaration of withoutComments.split(";")) {
    const separator = declaration.indexOf(":");
    if (separator < 1) continue;

    const property = declaration.slice(0, separator).trim();
    const value = declaration.slice(separator + 1).trim();
    if (!/^-?[a-z][a-z0-9-]*$/i.test(property) || !value) continue;
    if (
      /(?:expression\s*\(|javascript\s*:|vbscript\s*:|behavior\s*:|-moz-binding|@import)/i.test(
        value
      )
    ) {
      continue;
    }

    const urls = [...value.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/gi)];
    if (
      urls.some((match) => {
        const candidate = match[2].trim();
        return !/^(?:https?:|cid:)/i.test(candidate);
      })
    ) {
      continue;
    }

    declarations.push(`${property}:${value}`);
  }

  return declarations.join(";");
}

