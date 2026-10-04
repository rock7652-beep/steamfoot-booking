// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PanelReadProvider, usePanelReader } from "@/components/operations/panel-read-cache";
let host: HTMLDivElement, root: Root;
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); host = document.createElement("div"); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); vi.useRealTimers(); });
type Reader = ReturnType<typeof usePanelReader<[string], string>>;
const readers: Record<string, Reader> = {};
function Consumer({name, fetcher, ttl = 100, revision = ""}: {name: string; fetcher: (key: string) => Promise<string>; ttl?: number; revision?: string}) {
  const reader = usePanelReader("customer", fetcher, revision, ttl);
  React.useEffect(() => { readers[name] = reader; }, [reader, name]);
  return null;
}
function tree(key: string, children: React.ReactNode[]) { return React.createElement(PanelReadProvider, {key}, ...children); }
function consumer(name: string, fetcher: (key: string) => Promise<string>, options: {ttl?: number; revision?: string} = {}) { return React.createElement(Consumer, {key: name, name, fetcher, ...options}); }
it("shares intent preload with another panel but isolates a new account/store boundary", async () => {
  const fetcher = vi.fn(async (id: string) => `first:${id}`);
  await act(async () => root.render(tree("store-a", [consumer("trigger", fetcher), consumer("panel", fetcher)])));
  readers.trigger.prefetch("1");
  expect(await readers.panel.read("1")).toBe("first:1");
  expect(fetcher).toHaveBeenCalledTimes(1);
  await act(async () => root.render(tree("store-b", [consumer("panel", async id => `second:${id}`)])));
  expect(await readers.panel.read("1")).toBe("second:1");
});
it("discards prefetched data after a mutation or new server revision", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce("before").mockResolvedValueOnce("after").mockResolvedValueOnce("revision");
  await act(async () => root.render(tree("store", [consumer("panel", fetcher)])));
  expect(await readers.panel.read("1")).toBe("before");
  readers.panel.invalidate("1");
  expect(await readers.panel.read("1")).toBe("after");
  await act(async () => root.render(tree("store", [consumer("panel", fetcher, {revision: "new"})])));
  expect(await readers.panel.read("1")).toBe("revision");
});
it("live balances never reuse a completed response but deduplicate concurrent reads", async () => {
  const fetcher = vi.fn(async () => "balance");
  await act(async () => root.render(tree("store", [consumer("panel", fetcher, {ttl: 0})])));
  const first = readers.panel.read("1");
  expect(readers.panel.read("1")).toBe(first);
  await first;
  await readers.panel.read("1");
  expect(fetcher).toHaveBeenCalledTimes(2);
});
