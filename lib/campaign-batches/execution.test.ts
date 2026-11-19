import { describe, expect, it } from "vitest";
import { runBatchWithConcurrency } from "./execution";

describe("runBatchWithConcurrency", () => {
  it("keeps results ordered while isolating failed campaigns", async () => {
    const results = await runBatchWithConcurrency(["a", "b", "c"], 2, async (id) => {
      if (id === "b") throw new Error("rejected");
      return `${id}-sent`;
    });

    expect(results.map((result) => [result.id, result.status])).toEqual([
      ["a", "fulfilled"],
      ["b", "rejected"],
      ["c", "fulfilled"],
    ]);
  });

  it("never exceeds the configured concurrency", async () => {
    let active = 0;
    let peak = 0;
    await runBatchWithConcurrency(
      Array.from({ length: 10 }, (_, index) => String(index)),
      3,
      async () => {
        active += 1;
        peak = Math.max(peak, active);
        await Promise.resolve();
        active -= 1;
      },
    );
    expect(peak).toBe(3);
  });
});
