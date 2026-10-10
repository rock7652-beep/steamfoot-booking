// @vitest-environment jsdom
import { act, createElement, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useCourseRoomCreate } from "@/components/admin/use-course-room-create";
import { courseRoomInput } from "@/lib/course-room-input";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let hook: ReturnType<typeof useCourseRoomCreate>, root: Root, host: HTMLDivElement;
const fetchMock = vi.fn(), saved = vi.fn();
function Harness({ store = "store-a" }) { const current = useCourseRoomCreate(store, saved); useLayoutEffect(() => { hook = current; }); return null; }
const form = () => { const data = new FormData(); data.set("name", "教室 A"); return data; };
const response = (storeId = "store-a") => ({ json: async () => ({ success: true, storeId, data: { ...courseRoomInput.parse({ name: "教室 A" }), id: "room-a", isActive: true } }) });
beforeEach(async () => {
  fetchMock.mockReset(); saved.mockReset(); vi.stubGlobal("fetch", fetchMock);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(createElement(Harness)));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
it("locks immediate double clicks and only acknowledges an authoritative result", async () => {
  let resolve!: (value: unknown) => void;
  fetchMock.mockImplementation(() => new Promise(done => { resolve = done; }));
  let first!: Promise<void>;
  await act(async () => { first = hook.save(form()); void hook.save(form()); });
  expect(fetchMock).toHaveBeenCalledTimes(1); expect(hook.pending).toBe(true); expect(saved).not.toHaveBeenCalled();
  await act(async () => { resolve(response()); await first; });
  expect(saved).toHaveBeenCalledTimes(1); expect(hook.pending).toBe(false);
});
it("retries a lost response with exactly the original key and payload", async () => {
  fetchMock.mockRejectedValueOnce(new Error("network"));
  await act(async () => hook.save(form())); expect(hook.uncertain).toBe(true); expect(saved).not.toHaveBeenCalled();
  const first = fetchMock.mock.calls[0][1].body;
  fetchMock.mockResolvedValueOnce(response());
  await act(async () => hook.save(new FormData()));
  expect(fetchMock.mock.calls[1][1].body).toBe(first); expect(hook.uncertain).toBe(false); expect(saved).toHaveBeenCalledTimes(1);
});
it("keeps the original receipt on an ambiguous server failure", async () => {
  fetchMock.mockResolvedValueOnce({ json: async () => ({ success: false, uncertain: true, error: "DB timeout" }) });
  await act(async () => hook.save(form())); expect(hook.uncertain).toBe(true);
  fetchMock.mockResolvedValueOnce(response()); await act(async () => hook.save(form()));
  expect(fetchMock.mock.calls[1][1].body).toBe(fetchMock.mock.calls[0][1].body);
});
it("explicit rejection allows correction and a fresh attempt", async () => {
  fetchMock.mockResolvedValueOnce({ json: async () => ({ success: false, error: "同名空間" }) });
  await act(async () => hook.save(form())); expect(hook.error).toBe("同名空間"); expect(hook.uncertain).toBe(false);
  fetchMock.mockResolvedValueOnce(response()); await act(async () => hook.save(form()));
  expect(fetchMock.mock.calls[1][1].body).not.toBe(fetchMock.mock.calls[0][1].body);
});
it("does not apply a mismatched store response", async () => {
  fetchMock.mockResolvedValueOnce(response("store-b")); await act(async () => hook.save(form()));
  expect(saved).not.toHaveBeenCalled(); expect(hook.uncertain).toBe(true);
});
it("ignores a response after the workspace was unmounted", async () => {
  let resolve!: (value: unknown) => void; fetchMock.mockImplementation(() => new Promise(done => { resolve = done; }));
  let pending!: Promise<void>;
  await act(async () => { pending = hook.save(form()); });
  await act(async () => root.render(null)); await act(async () => { resolve(response()); await pending; });
  expect(saved).not.toHaveBeenCalled();
});
