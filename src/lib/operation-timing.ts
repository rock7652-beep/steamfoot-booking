/** Fixed labels only: never include customer IDs, notes, tokens or raw errors. */
export class OperationTiming {
  private readonly started = performance.now();
  private readonly spans: { name: string; durationMs: number; ok: boolean }[] = [];

  constructor(private readonly operation: string) {}

  async measure<T>(name: string, work: () => Promise<T>): Promise<T> {
    const start = performance.now();
    let ok = false;
    try {
      const result = await work();
      ok = true;
      return result;
    } finally {
      this.spans.push({ name, durationMs: Math.round(performance.now() - start), ok });
    }
  }

  finish() {
    console.info('[OPERATION_PERF]', JSON.stringify({
      operation: this.operation,
      totalMs: Math.round(performance.now() - this.started),
      spans: this.spans,
    }));
  }
}
