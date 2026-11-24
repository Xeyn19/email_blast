export type OverviewMetrics = {
  active: number;
  waiting: number;
  sent: number;
  failed: number;
};

export type AudienceHealth = {
  subscribed: number;
  pending: number;
  unsubscribed: number;
  total: number;
};

export type OverviewBatch = {
  id: string;
  name: string;
  status: string;
  campaignCount: number;
  sentCount: number;
};

export type DeliveryOverview =
  | { kind: "empty" }
  | { kind: "unavailable" }
  | {
      kind: "prepared" | "waiting" | "sending";
      batch: OverviewBatch;
    };

const DELIVERY_PRIORITY: Record<string, number> = {
  sending: 3,
  waiting: 2,
  preparing: 1,
  prepared: 1,
};

export function buildOverviewMetrics(input: Partial<OverviewMetrics>): OverviewMetrics {
  return {
    active: input.active ?? 0,
    waiting: input.waiting ?? 0,
    sent: input.sent ?? 0,
    failed: input.failed ?? 0,
  };
}

export function buildAudienceHealth(
  input: Partial<Omit<AudienceHealth, "total">>,
): AudienceHealth {
  const subscribed = input.subscribed ?? 0;
  const pending = input.pending ?? 0;
  const unsubscribed = input.unsubscribed ?? 0;
  return {
    subscribed,
    pending,
    unsubscribed,
    total: subscribed + pending + unsubscribed,
  };
}

export function selectDeliveryOverview(
  batches: OverviewBatch[],
  unavailable = false,
): DeliveryOverview {
  if (unavailable) return { kind: "unavailable" };

  const selected = [...batches].sort(
    (left, right) =>
      (DELIVERY_PRIORITY[right.status] ?? 0) -
      (DELIVERY_PRIORITY[left.status] ?? 0),
  )[0];
  if (!selected) return { kind: "empty" };
  if (selected.status === "sending") return { kind: "sending", batch: selected };
  if (selected.status === "waiting") return { kind: "waiting", batch: selected };
  return { kind: "prepared", batch: selected };
}

export function getDeliveryStepState(
  step: "prepared" | "waiting" | "sending" | "completed",
  delivery: DeliveryOverview,
) {
  if (delivery.kind === "empty" || delivery.kind === "unavailable") {
    return "upcoming" as const;
  }

  const rank = { prepared: 1, waiting: 2, sending: 3, completed: 4 };
  const currentRank = rank[delivery.kind];
  const stepRank = rank[step];
  if (stepRank < currentRank) return "complete" as const;
  if (stepRank === currentRank) return "current" as const;
  return "upcoming" as const;
}
