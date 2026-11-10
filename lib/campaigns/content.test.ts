import { describe, expect, it } from "vitest";
import { emailHtmlToText, textToEmailHtml } from "./content";

describe("campaign email content", () => {
  it("escapes user HTML and preserves line breaks", () => {
    expect(textToEmailHtml('<script>alert("x")</script>\nHello & welcome')).toBe(
      "<div>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;<br>Hello &amp; welcome</div>"
    );
  });

  it("converts saved simple HTML back to editable text", () => {
    expect(emailHtmlToText("<div>Hello &amp; welcome<br>Second line</div>")).toBe(
      "Hello & welcome\nSecond line"
    );
  });
});

