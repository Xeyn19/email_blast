import { describe, expect, it } from "vitest";
import {
  BREVO_RECIPIENT_NAME_TOKEN,
  compileRecipientToken,
  renderRecipientPreview,
} from "./tokens";

describe("email-template recipient tokens", () => {
  it("compiles the app token to Brevo template language", () => {
    expect(compileRecipientToken("<p>Dear {{recipient_name}},</p>")).toBe(
      `<p>Dear ${BREVO_RECIPIENT_NAME_TOKEN},</p>`
    );
  });

  it("escapes recipient values in local previews", () => {
    const preview = renderRecipientPreview(
      "<p>{{recipient_name}}</p>",
      '<script>alert("x")</script>'
    );
    expect(preview).toContain("&lt;script&gt;");
    expect(preview).not.toContain("<script>");
  });

  it("previews an already compiled campaign snapshot", () => {
    expect(
      renderRecipientPreview(`<p>${BREVO_RECIPIENT_NAME_TOKEN}</p>`, "XMETA")
    ).toBe("<p>XMETA</p>");
  });
});
