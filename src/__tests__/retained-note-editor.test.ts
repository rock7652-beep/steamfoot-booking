// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { OperationScope } from "@/components/operations/operation-scope";
import { RetainedNoteEditor, type NoteSaveResult } from "@/components/operations/retained-note-editor";
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard/customers", useRouter: () => ({ refresh: vi.fn() }) }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const save = vi.fn<(value: string | null, expected: string | null) => Promise<NoteSaveResult>>();
const onSaved = vi.fn();
beforeEach(() => { sessionStorage.clear(); save.mockReset(); onSaved.mockReset(); container=document.createElement("div"); document.body.append(container); root=createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); });
async function render(scope="user:store-a", id="a", value: string | null="original") {
  await act(async () => root.render(React.createElement(OperationScope, { key: scope, scope }, React.createElement(RetainedNoteEditor, {
    key: id, stateKey: `note:${id}`, title:"店內備註", hint:"店內可見", placeholder:"備註", maxLength:1000, value, canEdit:true, save, onSaved,
  }))));
}
function button(text: string) { return [...container.querySelectorAll("button")].find(b => b.textContent === text)!; }
async function enter(text: string) {
  if (!container.querySelector("textarea")) await act(async () => button("編輯").click());
  const input=container.querySelector("textarea")!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value")!.set!.call(input,text); input.dispatchEvent(new Event("input",{bubbles:true})); });
}
it("retains edits across customer switches, server refreshes, and same-account remounts", async () => {
  await render(); await enter("my draft");
  await render("user:store-a","a","other person's update");
  expect(container.querySelector("textarea")?.value).toBe("my draft");
  await render("user:store-a","b"); expect(container.querySelector("textarea")).toBeNull();
  await render(); expect(container.querySelector("textarea")?.value).toBe("my draft");
  await act(async () => root.unmount()); root=createRoot(container);
  await render(); expect(container.querySelector("textarea")?.value).toBe("my draft"); expect(save).not.toHaveBeenCalled();
});
it("never restores A's draft under another store or account", async () => {
  await render(); await enter("private draft");
  await render("user:store-b"); expect(container.textContent).not.toContain("private draft"); expect(container.querySelector("textarea")).toBeNull();
  await render("other-user:store-a"); expect(container.querySelector("textarea")).toBeNull();
});
it("sends once on double click, clears draft only after confirmed success", async () => {
  let finish!: (result: NoteSaveResult)=>void;
  save.mockImplementation(() => new Promise(resolve=>{finish=resolve;}));
  await render(); await enter("updated");
  const submit=button("儲存"); await act(async()=>{submit.click();submit.click();});
  expect(save).toHaveBeenCalledExactlyOnceWith("updated","original");
  await act(async()=>{finish({success:true});});
  expect(onSaved).toHaveBeenCalledWith("updated"); expect(container.querySelector("textarea")).toBeNull();
  await render("user:store-a","b"); await render("user:store-a","a","updated"); expect(container.querySelector("textarea")).toBeNull();
});
it("keeps input and requires explicit review before saving over a conflicting note", async () => {
  save.mockResolvedValueOnce({success:false,error:"已由其他人更新",currentValue:"colleague"}).mockResolvedValueOnce({success:true});
  await render(); await enter("mine"); await act(async()=>button("儲存").click());
  expect(container.querySelector("textarea")?.value).toBe("mine"); expect(container.textContent).toContain("colleague"); expect(button("儲存").disabled).toBe(true);
  await act(async()=>button("保留我的輸入，繼續編輯").click()); await act(async()=>button("儲存").click());
  expect(save).toHaveBeenLastCalledWith("mine","colleague");
});
it("keeps failed or login-expired input and never automatically replays a write", async () => {
  save.mockRejectedValue(Error("offline"));
  await render(); await enter("draft"); await act(async()=>button("儲存").click());
  expect(container.querySelector("textarea")?.value).toBe("draft");
  await act(async()=>window.dispatchEvent(new Event("online")));
  expect(save).toHaveBeenCalledOnce(); expect(onSaved).not.toHaveBeenCalled();
});
it("does not allow a late save of A to invoke callbacks for B", async () => {
  let finish!: (result: NoteSaveResult)=>void; save.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  await render(); await enter("A changed"); await act(async()=>button("儲存").click());
  await render("user:store-a","b","B content"); await act(async()=>{finish({success:true});});
  expect(container.textContent).toContain("B content"); expect(onSaved).not.toHaveBeenCalled();
});
it("asks before discarding a changed draft but not an unchanged editor", async () => {
  const confirm=vi.spyOn(window,"confirm").mockReturnValue(false);
  await render(); await enter("changed"); await act(async()=>button("取消").click());
  expect(confirm).toHaveBeenCalledOnce(); expect(container.querySelector("textarea")?.value).toBe("changed");
  confirm.mockReturnValue(true); await act(async()=>button("取消").click());
  await act(async()=>button("編輯").click()); await act(async()=>button("取消").click());
  expect(confirm).toHaveBeenCalledTimes(2);
});
it("undoes only the saved note with a compare-and-set expectation", async () => {
  save.mockResolvedValue({success:true});
  await render(); await enter("new note"); await act(async()=>button("儲存").click());
  await act(async()=>button("復原").click());
  expect(save).toHaveBeenLastCalledWith("original","new note");
  expect(onSaved).toHaveBeenLastCalledWith("original"); expect(button("復原")).toBeUndefined();
});
