import { describe, expect, it } from "vitest";
import {
  campaignUsesRecipientPersonalization,
  getBrevoRecipientAttributes,
  getRecipientName,
} from "./personalization";

describe("recipient-name personalization", () => {
  it("uses the contact full name when available", () => {
    expect(
      getRecipientName({ full_name: " Edgar Orosa ", company: "XMETA", email: "edgar@example.com" })
    ).toBe("Edgar Orosa");
  });

  it("falls back to company for organization-only Excel contacts", () => {
    expect(getRecipientName({ full_name: null, company: " Wendy's ", email: "store@example.com" })).toBe(
      "Wendy's"
    );
  });

  it("falls back to the contact email when name and company are unavailable", () => {
    expect(
      getRecipientName({ full_name: " ", company: null, email: "user@example.com" })
    ).toBe("user@example.com");
  });

  it("builds an independent RECIPIENT_NAME value for every Brevo contact", () => {
    const contacts = [
      { full_name: "Edgar Orosa", company: "XMETA", email: "edgar@example.com" },
      { full_name: null, company: "Sample School", email: "school@example.com" },
      { full_name: " ", company: " ", email: "fallback@example.com" },
    ];

    expect(contacts.map(getBrevoRecipientAttributes)).toEqual([
      { RECIPIENT_NAME: "Edgar Orosa" },
      { RECIPIENT_NAME: "Sample School" },
      { RECIPIENT_NAME: "fallback@example.com" },
    ]);
  });

  it("detects personalization only in compiled campaign HTML", () => {
    expect(
      campaignUsesRecipientPersonalization(
        '<p>Dear {{ contact.RECIPIENT_NAME|default:"Valued Partner" }},</p>'
      )
    ).toBe(true);
    expect(
      campaignUsesRecipientPersonalization("<p>Dear Valued Partner,</p>")
    ).toBe(false);
  });
});
