import { describe, expect, it } from "vitest";
import {
  buildAudienceHealth,
  buildOverviewMetrics,
  getDeliveryStepState,
  selectDeliveryOverview,
} from "./overview";

describe("overview dashboard data", () => {
  it("uses safe zero defaults for partial metric and audience results", () => {
    expect(buildOverviewMetrics({ active: 3, sent: 6 })).toEqual({
      active: 3,
      waiting: 0,
      sent: 6,
      failed: 0,
    });
    expect(buildAudienceHealth({ subscribed: 104, unsubscribed: 4 })).toEqual({
      subscribed: 104,
      pending: 0,
      unsubscribed: 4,
      total: 108,
    });
  });

  it("prioritizes sending, then waiting, then prepared batches", () => {
    const prepared = {
      id: "prepared",
      name: "Prepared",
      status: "prepared",
      campaignCount: 1,
      sentCount: 0,
    };
    const waiting = { ...prepared, id: "waiting", name: "Waiting", status: "waiting" };
    const sending = { ...prepared, id: "sending", name: "Sending", status: "sending" };

    expect(selectDeliveryOverview([prepared, waiting, sending])).toMatchObject({
      kind: "sending",
      batch: { id: "sending" },
    });
    expect(selectDeliveryOverview([prepared, waiting])).toMatchObject({
      kind: "waiting",
      batch: { id: "waiting" },
    });
    expect(selectDeliveryOverview([prepared])).toMatchObject({ kind: "prepared" });
  });

  it("maps delivery lifecycle steps and error fallbacks", () => {
    const delivery = selectDeliveryOverview([
      {
        id: "batch-1",
        name: "Batch",
        status: "waiting",
        campaignCount: 2,
        sentCount: 0,
      },
    ]);

    expect(getDeliveryStepState("prepared", delivery)).toBe("complete");
    expect(getDeliveryStepState("waiting", delivery)).toBe("current");
    expect(getDeliveryStepState("sending", delivery)).toBe("upcoming");
    expect(selectDeliveryOverview([], true)).toEqual({ kind: "unavailable" });
    expect(selectDeliveryOverview([])).toEqual({ kind: "empty" });
  });
});
