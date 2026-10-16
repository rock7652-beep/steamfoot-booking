// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PanelReadProvider, usePanelReader } from "@/components/operations/panel-read-cache";
const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }), usePathname: () => "/s/lubymusic/admin/dashboard/courses" }));
vi.mock("@/lib/music-finance-sync", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/music-finance-sync")>(), isMusicPreviewPage: () => true }));
import { MUSIC_FINANCE_SIGNAL } from "@/lib/music-finance-sync";
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

it("invalidates other-panel reads without remounting drafts or duplicating refreshes", async () => {
  vi.useFakeTimers(); refresh.mockClear();
  let mounts = 0;
  function Draft() {
    React.useEffect(() => { mounts++; }, []);
    return React.createElement("input", { defaultValue: "尚未儲存的內容" });
  }
  const fetcher = vi.fn().mockResolvedValueOnce("old").mockResolvedValueOnce("new");
  await act(async () => root.render(tree("music", [consumer("panel", fetcher), React.createElement(Draft, {key:"draft"})])));
  expect(await readers.panel.read("1")).toBe("old");
  const input = host.querySelector("input")!; input.value = "保留我的草稿";
  await act(async () => {
    window.dispatchEvent(new StorageEvent("storage", {key:MUSIC_FINANCE_SIGNAL,newValue:"external-save"}));
    window.dispatchEvent(new CustomEvent(MUSIC_FINANCE_SIGNAL, {detail:"external-save"}));
    await vi.advanceTimersByTimeAsync(151);
  });
  expect(await readers.panel.read("1")).toBe("new");
  expect(refresh).toHaveBeenCalledOnce();
  expect(mounts).toBe(1);
  expect(host.querySelector("input")).toBe(input);
  expect(input.value).toBe("保留我的草稿");
});
