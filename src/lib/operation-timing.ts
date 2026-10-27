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

  /** Fixed server-side labels only; values expose elapsed milliseconds, not input. */
  serverTiming() {
    return [`total;dur=${Math.round(performance.now() - this.started)}`,
      ...this.spans.map(span => `${span.name.replace(/[^a-zA-Z0-9_-]/g, "_")};dur=${span.durationMs}`),
    ].join(", ");
  }
}
