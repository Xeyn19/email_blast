import { describe, expect, it } from "vitest";
import {
  EMAIL_PREVIEW_MAX_LENGTH,
  EMAIL_SUBJECT_MAX_LENGTH,
  deriveTemplateMetadata,
} from "./metadata";

describe("deriveTemplateMetadata", () => {
  it("uses explicit title and description metadata and decodes entities", () => {
    expect(
      deriveTemplateMetadata(
        '<html><head><title>Sales &amp; Marketing</title><meta content="A smarter &quot;inbox&quot; preview." name="description"></head><body><h1>Ignored</h1></body></html>',
        "Quarterly offer",
      ),
    ).toEqual({
      defaultCampaignName: "Quarterly offer",
      defaultSubject: "Sales & Marketing",
      defaultPreviewText: 'A smarter "inbox" preview.',
    });
  });

  it.each([
    {
      label: "IPAY",
      html: '<h1>Enrollment +<br>Payments in<br>One System</h1><p>A smarter way for schools to manage enrollment, student records, billing, and payment collection through one connected platform.</p>',
      name: "IPAY School Solutions",
      subject: "Enrollment + Payments in One System",
      preview: "A smarter way for schools to manage enrollment, student records, billing, and payment collection through one connected platform.",
    },
    {
      label: "PITX",
      html: '<h1>Turn Foot Traffic Into More Sales</h1><p>Advertise on X-Meta’s digital screens within the PITX vicinity and claim a free advertising spot when you schedule an appointment.</p>',
      name: "PITX Advertising",
      subject: "Turn Foot Traffic Into More Sales",
      preview: "Advertise on X-Meta’s digital screens within the PITX vicinity and claim a free advertising spot when you schedule an appointment.",
    },
    {
      label: "E-Jeep",
      html: '<p>Dear {{recipient_name}},</p><p>Good day!</p><p>Put your brand in motion with X-Meta Technologies, Inc. Advertise on digital screens inside modernized E-Jeepneys and connect with commuters.</p><h2>Expand your reach across key locations</h2>',
      name: "E-Jeep Advertising",
      subject: "Expand your reach across key locations",
      preview: "Put your brand in motion with X-Meta Technologies, Inc. Advertise on digital screens inside modernized E-Jeepneys and connect with commuters.",
    },
  ])("derives $label defaults from visible content", ({ html, name, subject, preview }) => {
    expect(deriveTemplateMetadata(html, name)).toEqual({
      defaultCampaignName: name,
      defaultSubject: subject,
      defaultPreviewText: preview,
    });
  });

  it("falls back from h1 to h2 and finally to the saved template name", () => {
    expect(
      deriveTemplateMetadata("<h2>Secondary heading</h2>", "Saved template"),
    ).toMatchObject({ defaultSubject: "Secondary heading" });
    expect(
      deriveTemplateMetadata('<img src="https://example.com/ad.png">', "Saved template"),
    ).toEqual({
      defaultCampaignName: "Saved template",
      defaultSubject: "Saved template",
      defaultPreviewText: "",
    });
  });

  it("skips greetings, empty markup, and short paragraphs", () => {
    const html = [
      "<p><strong> </strong></p>",
      "<p>Hello Edgar, welcome to this special offer for your company.</p>",
      "<p>Short supporting text.</p>",
      "<p>This meaningful paragraph explains the campaign clearly enough to appear as inbox preview text.</p>",
    ].join("");

    expect(deriveTemplateMetadata(html, "Campaign").defaultPreviewText).toBe(
      "This meaningful paragraph explains the campaign clearly enough to appear as inbox preview text.",
    );
  });

  it("limits subject and preview at word boundaries", () => {
    const subject = Array.from({ length: 40 }, () => "subject").join(" ");
    const preview = Array.from({ length: 60 }, () => "preview").join(" ");
    const metadata = deriveTemplateMetadata(
      `<h1>${subject}</h1><p>${preview}</p>`,
      "Campaign",
    );

    expect(metadata.defaultSubject.length).toBeLessThanOrEqual(
      EMAIL_SUBJECT_MAX_LENGTH,
    );
    expect(metadata.defaultPreviewText.length).toBeLessThanOrEqual(
      EMAIL_PREVIEW_MAX_LENGTH,
    );
    expect(metadata.defaultSubject.endsWith("subject")).toBe(true);
    expect(metadata.defaultPreviewText.endsWith("preview")).toBe(true);
  });
});
