// @vitest-environment jsdom
import { act, createElement, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { useResponsiveAction } from "@/hooks/use-responsive-action";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const roots: ReturnType<typeof createRoot>[] = [];
afterEach(() => { act(() => roots.splice(0).forEach(root => root.unmount())); });
function setup() {
  let hook!: ReturnType<typeof useResponsiveAction>;
  function Harness() { const value = useResponsiveAction(); useLayoutEffect(() => { hook = value; }); return null; }
  const root = createRoot(document.createElement("div")); roots.push(root);
  act(() => root.render(createElement(Harness)));
  return () => hook;
}
const callbacks = () => ({ apply: vi.fn(), rollback: vi.fn(), confirmed: vi.fn() });
it("updates immediately, blocks same-row double clicks, and permits other rows", async () => {
  const hook = setup(); const a = callbacks(); const b = callbacks();
  let resolve!: (value: {success: boolean}) => void;
  const action = vi.fn(() => new Promise<{success: boolean}>(r => { resolve = r; }));
  let request!: ReturnType<ReturnType<typeof useResponsiveAction>["run"]>;
  act(() => { request = hook().run("a", action, a); void hook().run("a", action, a); });
  expect(a.apply).toHaveBeenCalledTimes(1); expect(action).toHaveBeenCalledTimes(1);
  expect(hook().states.a.phase).toBe("saving");
  await act(() => hook().run("b", async () => ({success: true}), b));
  expect(b.confirmed).toHaveBeenCalledOnce();
  await act(async () => { resolve({success:true}); await request; });
  expect(hook().isBlocked("a")).toBe(false); expect(a.rollback).not.toHaveBeenCalled();
});
it("rolls back explicit rejection and permits retry", async () => {
  const hook = setup(); const cb = callbacks();
  await act(() => hook().run("a", async () => ({ success:false, error:"不可修改" }), cb));
  expect(cb.rollback).toHaveBeenCalledOnce(); expect(hook().states.a.message).toBe("不可修改");
  expect(hook().isBlocked("a")).toBe(false);
});
it("keeps uncertain writes locked instead of allowing duplicate submission", async () => {
  const hook = setup(); const cb = callbacks(); const action = vi.fn(async () => { throw Error("offline"); });
  await act(() => hook().run("a", action, cb));
  await act(() => hook().run("a", action, cb));
  expect(action).toHaveBeenCalledOnce(); expect(cb.rollback).toHaveBeenCalledOnce();
  expect(cb.confirmed).not.toHaveBeenCalled(); expect(hook().states.a.phase).toBe("unknown");
});

it("automatically confirms a committed write without replaying it", async () => {
  const hook = setup();
  const write = vi.fn(async () => { throw Error("response lost"); });
  const cb = { ...callbacks(), reconcile: vi.fn(async () => true), recovered: vi.fn() };
  await act(() => hook().run("a", write, cb));
  expect(write).toHaveBeenCalledOnce();
  expect(cb.reconcile).toHaveBeenCalledOnce();
  expect(cb.recovered).toHaveBeenCalledOnce();
  expect(cb.confirmed).not.toHaveBeenCalled();
  expect(hook().isBlocked("a")).toBe(false);
  expect(hook().states.a.phase).toBe("saved");
});

it("keeps stale results locked and deduplicates manual read-only checks", async () => {
  const hook = setup();
  const write = vi.fn(async () => { throw Error("offline"); });
  let finish!: (result: boolean) => void;
  const reconcile = vi.fn< (signal: AbortSignal) => Promise<boolean> >()
    .mockResolvedValueOnce(false)
    .mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const cb = { ...callbacks(), reconcile, recovered: vi.fn() };
  await act(() => hook().run("a", write, cb));
  expect(hook().isBlocked("a")).toBe(true);
  expect(hook().states.a.phase).toBe("unknown");
  let pending!: ReturnType<ReturnType<typeof useResponsiveAction>["check"]>;
  act(() => { pending = hook().check("a"); void hook().check("a"); void hook().run("a", write, cb); });
  expect(hook().states.a.phase).toBe("checking");
  expect(reconcile).toHaveBeenCalledTimes(2);
  await act(async () => { finish(true); await pending; });
  expect(write).toHaveBeenCalledOnce();
  expect(cb.recovered).toHaveBeenCalledOnce();
  expect(hook().isBlocked("a")).toBe(false);
});

it("rechecks unknown results on reconnection without another write", async () => {
  const hook = setup();
  const write = vi.fn(async () => { throw Error("offline"); });
  const cb = { ...callbacks(), reconcile: vi.fn().mockRejectedValueOnce(Error("offline")).mockResolvedValueOnce(true), recovered: vi.fn() };
  await act(() => hook().run("a", write, cb));
  await act(async () => { window.dispatchEvent(new Event("online")); });
  expect(write).toHaveBeenCalledOnce();
  expect(cb.recovered).toHaveBeenCalledOnce();
  expect(hook().isBlocked("a")).toBe(false);
});

it("bounds an unresponsive read and ignores its late confirmation", async () => {
  vi.useFakeTimers();
  try {
    const hook = setup();
    let finish!: (result: boolean) => void;
    let signal!: AbortSignal;
    const cb = { ...callbacks(), recovered: vi.fn(), reconcile: (s: AbortSignal) => {
      signal = s; return new Promise<boolean>(resolve => { finish = resolve; });
    } };
    let pending!: ReturnType<ReturnType<typeof useResponsiveAction>["run"]>;
    await act(async () => { pending = hook().run("a", async () => { throw Error("offline"); }, cb); });
    expect(hook().states.a.phase).toBe("checking");
    await act(async () => { await vi.advanceTimersByTimeAsync(8000); await pending; });
    expect(hook().states.a.phase).toBe("unknown");
    expect(signal.aborted).toBe(true);
    await act(async () => { finish(true); });
    expect(cb.recovered).not.toHaveBeenCalled();
    expect(hook().isBlocked("a")).toBe(true);
  } finally { vi.useRealTimers(); }
});
