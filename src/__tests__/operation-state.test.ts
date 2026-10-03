// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";
import { createOperationState, operationStateKey, readOperationState, clearOperationState } from "@/lib/operation-state";
const valid = (v: unknown): v is string => typeof v === "string";
beforeEach(() => { sessionStorage.clear(); vi.restoreAllMocks(); });
it("keeps account, store and record state separate across remounts", () => {
  const a = createOperationState("user-a:store-a");
  a.set("note:1", "draft a"); a.set("note:2", "draft b");
  const restored = createOperationState("user-a:store-a");
  restored.subscribe("note:1", valid, () => {});
  expect(restored.get("note:1", "")).toBe("draft a");
  for (const scope of ["user-b:store-a", "user-a:store-b"]) {
    const other = createOperationState(scope); other.subscribe("note:1", valid, () => {});
    expect(other.get("note:1", "")).toBe("");
  }
});
it("discards expired, invalid and future-dated storage without blocking editing", () => {
  const key = operationStateKey("scope", "note");
  for (const data of ["{broken", JSON.stringify({at:0,value:"old"}), JSON.stringify({at:100,value:42}), JSON.stringify({at:99999999,value:"future"})]) {
    sessionStorage.setItem(key, data);
    expect(readOperationState(sessionStorage,key,valid,30_000_000)).toBeUndefined();
  }
});
it("works in memory when browser storage is blocked", () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw Error("denied"); });
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw Error("denied"); });
  const state = createOperationState("a"); const notify = vi.fn();
  const stop = state.subscribe("note",valid,notify);
  state.set("note","text"); expect(state.get("note", "")).toBe("text"); expect(notify).toHaveBeenCalledOnce();
  stop(); state.set("note","next"); expect(notify).toHaveBeenCalledOnce();
});
it("explicit logout clears only operation state", () => {
  createOperationState("a").set("note","private"); sessionStorage.setItem("other-app","keep");
  clearOperationState(sessionStorage);
  expect(sessionStorage.length).toBe(1); expect(sessionStorage.getItem("other-app")).toBe("keep");
});
