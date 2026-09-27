// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { useResponsiveAction } from "@/hooks/use-responsive-action";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const roots: ReturnType<typeof createRoot>[] = [];
afterEach(() => { act(() => roots.splice(0).forEach(root => root.unmount())); });
function setup() {
  let hook!: ReturnType<typeof useResponsiveAction>;
  function Harness() { hook = useResponsiveAction(); return null; }
  const root = createRoot(document.createElement("div")); roots.push(root);
  act(() => root.render(createElement(Harness)));
  return () => hook;
}
const callbacks = () => ({ apply: vi.fn(), rollback: vi.fn(), confirmed: vi.fn() });
it("updates immediately, blocks same-row double clicks, and permits other rows", async () => {
  const hook = setup(); const a = callbacks(); const b = callbacks();
  let resolve!: (value: {success: boolean}) => void;
  const action = vi.fn(() => new Promise<{success: boolean}>(r => { resolve = r; }));
  let request!: Promise<void>;
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
