type Result = { success: boolean; error?: string };

/** Lock every row before sending one batch; ambiguous rows recover independently. */
export async function dispatchBookingBatch<T>(
  ids: string[],
  send: (ids: string[]) => Promise<{ results: Array<Result & { id: string }> }>,
  run: (id: string, action: () => Promise<Result>) => Promise<T>,
  sent: () => void,
): Promise<T[]> {
  const pending = ids.map(id => {
    let resolve!: (result: Result) => void;
    let reject!: (error: Error) => void;
    const response = new Promise<Result>((yes, no) => { resolve = yes; reject = no; });
    return { id, resolve, reject, outcome: run(id, () => response) };
  });
  try {
    const { results } = await send(ids);
    for (const row of pending) {
      const matches = Array.isArray(results) ? results.filter(result => result?.id === row.id) : [];
      const result = matches[0];
      if (matches.length === 1 && typeof result?.success === "boolean") row.resolve(result);
      else row.reject(new Error("結果待確認"));
    }
  } catch {
    for (const row of pending) row.reject(new Error("結果待確認"));
  } finally {
    sent();
  }
  return Promise.all(pending.map(row => row.outcome));
}
