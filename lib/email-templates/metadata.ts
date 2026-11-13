import sanitizeHtml from "sanitize-html";

export const EMAIL_SUBJECT_MAX_LENGTH = 120;
export const EMAIL_PREVIEW_MAX_LENGTH = 160;

export type EmailTemplateMetadata = {
  defaultCampaignName: string;
  defaultSubject: string;
  defaultPreviewText: string;
};

const COMMON_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  hellip: "…",
  laquo: "«",
  ldquo: "“",
  lsquo: "‘",
  lt: "<",
  mdash: "—",
  nbsp: " ",
  ndash: "–",
  quot: '"',
  raquo: "»",
  rdquo: "”",
  rsquo: "’",
};

export function deriveTemplateMetadata(
  html: string,
  templateName: string,
): EmailTemplateMetadata {
  const defaultCampaignName = normalizeWhitespace(templateName) || "Email campaign";
  const subjectCandidate =
    firstElementText(html, "title") ||
    firstElementText(html, "h1") ||
    firstElementText(html, "h2") ||
    defaultCampaignName;
  const description = findDescriptionMetadata(html);
  const paragraph = description ? "" : findMeaningfulParagraph(html);

  return {
    defaultCampaignName,
    defaultSubject: truncateAtWordBoundary(subjectCandidate, EMAIL_SUBJECT_MAX_LENGTH),
    defaultPreviewText: truncateAtWordBoundary(
      description || paragraph,
      EMAIL_PREVIEW_MAX_LENGTH,
    ),
  };
}

function firstElementText(html: string, tagName: "title" | "h1" | "h2") {
  const match = html.match(
    new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}\\s*>`, "i"),
  );
  return match ? normalizeHtmlText(match[1]) : "";
}

function findDescriptionMetadata(html: string) {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    if (getAttribute(tag, "name").toLowerCase() !== "description") continue;

    const value = normalizeHtmlText(getAttribute(tag, "content"));
    if (value) return value;
  }

  return "";
}

function findMeaningfulParagraph(html: string) {
  for (const match of html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p\s*>/gi)) {
    const value = normalizeHtmlText(match[1]);
    if (isMeaningfulParagraph(value)) return value;
  }

  return "";
}

function isMeaningfulParagraph(value: string) {
  if (value.length < 30) return false;

  return !/^(?:dear\b|hello\b|hi\b|good\s+(?:day|morning|afternoon|evening)\b)/i.test(
    value,
  );
}

function getAttribute(tag: string, attributeName: string) {
  const match = tag.match(
    new RegExp(
      `\\b${attributeName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>]+))`,
      "i",
    ),
  );
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? "";
}

function normalizeHtmlText(fragment: string) {
  const textOnly = sanitizeHtml(fragment.replace(/<br\s*\/?\s*>/gi, " "), {
    allowedTags: [],
    allowedAttributes: {},
  });

  return normalizeWhitespace(decodeHtmlEntities(textOnly));
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(value: string) {
  return value.replace(
    /&(?:#(\d+)|#x([\da-f]+)|([a-z][\da-z]+));/gi,
    (entity, decimal: string | undefined, hexadecimal: string | undefined, named: string | undefined) => {
      if (decimal) return safeCodePoint(Number.parseInt(decimal, 10), entity);
      if (hexadecimal) return safeCodePoint(Number.parseInt(hexadecimal, 16), entity);
      return named ? (COMMON_ENTITIES[named.toLowerCase()] ?? entity) : entity;
    },
  );
}

function safeCodePoint(value: number, fallback: string) {
  if (!Number.isInteger(value) || value < 0 || value > 0x10ffff) return fallback;

  try {
    return String.fromCodePoint(value);
  } catch {
    return fallback;
  }
}

function truncateAtWordBoundary(value: string, maximumLength: number) {
  const normalized = normalizeWhitespace(value);
  if (normalized.length <= maximumLength) return normalized;

  const candidate = normalized.slice(0, maximumLength + 1);
  const boundary = candidate.lastIndexOf(" ");
  return (boundary > 0
    ? candidate.slice(0, boundary)
    : normalized.slice(0, maximumLength)
  ).trimEnd();
}
