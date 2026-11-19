export type BatchTaskResult<T> =
  | { id: string; status: "fulfilled"; value: T }
  | { id: string; status: "rejected"; reason: unknown };

export async function runBatchWithConcurrency<T>(
  ids: string[],
  concurrency: number,
  task: (id: string) => Promise<T>,
) {
  const results = new Array<BatchTaskResult<T>>(ids.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < ids.length) {
      const index = nextIndex++;
      const id = ids[index];
      try {
        results[index] = { id, status: "fulfilled", value: await task(id) };
      } catch (reason) {
        results[index] = { id, status: "rejected", reason };
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(Math.max(concurrency, 1), ids.length) }, () => worker()),
  );
  return results;
}
