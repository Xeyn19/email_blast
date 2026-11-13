import { describe, expect, it } from "vitest";
import { getCampaignDetailsFromTemplate } from "./campaign-defaults";

describe("getCampaignDetailsFromTemplate", () => {
  it("returns the template's automatic campaign details", () => {
    expect(
      getCampaignDetailsFromTemplate({
        name: "E-Jeep Advertising",
        defaultCampaignName: "E-Jeep November Campaign",
        defaultSubject: "Expand your reach across key locations",
        defaultPreviewText: "Put your brand in motion with X-Meta.",
      }),
    ).toEqual({
      name: "E-Jeep November Campaign",
      subject: "Expand your reach across key locations",
      previewText: "Put your brand in motion with X-Meta.",
    });
  });

  it("falls back to the saved template name and an empty preview", () => {
    expect(
      getCampaignDetailsFromTemplate({
        name: "Image-only campaign",
        defaultSubject: null,
        defaultPreviewText: null,
      }),
    ).toEqual({
      name: "Image-only campaign",
      subject: "Image-only campaign",
      previewText: "",
    });
  });

  it("returns the newly selected template's values instead of prior defaults", () => {
    const first = getCampaignDetailsFromTemplate({
      name: "First",
      defaultSubject: "First subject",
      defaultPreviewText: "First preview",
    });
    const second = getCampaignDetailsFromTemplate({
      name: "Second",
      defaultSubject: "Second subject",
      defaultPreviewText: "Second preview",
    });

    expect(second).not.toEqual(first);
    expect(second).toEqual({
      name: "Second",
      subject: "Second subject",
      previewText: "Second preview",
    });
  });
});
