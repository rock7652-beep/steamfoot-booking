import { afterEach, describe, expect, it, vi } from "vitest";
import { createClientReadCache } from "@/lib/client-read-cache";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

afterEach(() => vi.useRealTimers());

describe("component-owned read cache", () => {
  it("deduplicates hover and open, reuses fresh results and expires them", async () => {
    vi.useFakeTimers();
    const response = deferred<string>();
    const fetcher = vi.fn(() => response.promise);
    const cache = createClientReadCache(fetcher, { ttlMs: 100 });
    const hover = cache.load("a");
    expect(cache.load("a")).toBe(hover);
    response.resolve("first");
    await hover;
    expect(await cache.load("a")).toBe("first");
    expect(fetcher).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(100);
    expect(cache.get("a")).toBeUndefined();
    await cache.load("a");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not let an old response overwrite data fetched after a mutation", async () => {
    const old = deferred<string>();
    const fresh = deferred<string>();
    const fetcher = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    const cache = createClientReadCache<string>(fetcher);
    const before = cache.load("a");
    await Promise.resolve();
    cache.invalidate("a");
    const after = cache.load("a");
    fresh.resolve("new");
    await after;
    old.resolve("old");
    await before;
    expect(cache.get("a")).toBe("new");
  });

  it("retries after a failed preload instead of caching errors", async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce("ok");
    const cache = createClientReadCache<string>(fetcher);
    await expect(cache.load("a")).rejects.toThrow("offline");
    expect(await cache.load("a")).toBe("ok");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("clear prevents in-flight reads from restoring invalidated data", async () => {
    const response = deferred<string>();
    const cache = createClientReadCache(() => response.promise);
    const loading = cache.load("a");
    cache.clear();
    response.resolve("old");
    await loading;
    expect(cache.get("a")).toBeUndefined();
  });

  it("keeps store/component instances isolated and caps memory", async () => {
    const first = createClientReadCache(async (id) => `store-a:${id}`, { maxEntries: 2 });
    const second = createClientReadCache(async (id) => `store-b:${id}`);
    await first.load("1");
    expect(second.get("1")).toBeUndefined();
    expect(await second.load("1")).toBe("store-b:1");
    await first.load("2");
    await first.load("3");
    expect(first.get("1")).toBeUndefined();
    expect(first.get("3")).toBe("store-a:3");
  });
});
