// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TrialApplicationForm } from "@/app/pricing/trial/trial-application-form";
import { emptyTrialApplication } from "@/lib/trial-application";

const key = "steambutler-trial-application-v1";
const data = { ...emptyTrialApplication, storeName: "測試教室", contactName: "測試聯絡人", phone: "0000000000", email: "test@example.invalid" };
const legacy = { ...data, developers: "invited", providerAdmin: "invited", messagingAdmin: "absent", loginAdmin: "help" };
const receipt = { requestId: "b4b32e57-3bf9-4e47-a98f-2d8ef21a9e62", token: "a".repeat(64), id: "test-id", revision: 2, status: "CONFIGURING" };
let host: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn();

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  localStorage.clear();
  history.replaceState(null, "", "/pricing/trial");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
async function mount() {
  await act(async () => root.render(createElement(TrialApplicationForm)));
}
function assertSimplifiedForm() {
  expect(host.querySelectorAll('[name="developers"], [name="providerAdmin"], [name="messagingAdmin"], [name="loginAdmin"]')).toHaveLength(0);
  expect(host.textContent).not.toMatch(/Developers|Provider Admin|Messaging API|LINE Login|已操作授權/);
  expect(host.querySelector('a[href="/pricing/trial/guide/developers"]')).toBeNull();
  for (const field of ["inviteUrl", "lineManagerContact", "sharedLine", "integration"]) {
    expect(host.querySelector(`[name="${field}"]`)).not.toBeNull();
  }
  expect(host.querySelector('a[href="/pricing/trial/guide/oa-admin"]')).not.toBeNull();
  expect([...host.querySelectorAll("h2")].map((heading) => heading.textContent)).toEqual([
    "1 · 店家與聯絡人", "2 · 官方 LINE", "3 · 視訊操作教學", "最後確認",
  ]);
}

describe("simplified trial LINE application", () => {
  it("keeps official-account fields and automatically saves drafts without Developers placeholders", async () => {
    await mount();
    assertSimplifiedForm();
    expect(JSON.parse(localStorage.getItem(key)!).data).toEqual(emptyTrialApplication);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("submits a new application without any Developers progress keys", async () => {
    localStorage.setItem(key, JSON.stringify({ data }));
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: receipt.id, revision: 1, status: "RECEIVED" }) });
    await mount();
    await act(async () => {
      host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.action).toBe("save");
    expect(sent.data).toEqual(data);
    for (const field of ["developers", "providerAdmin", "messagingAdmin", "loginAdmin"]) expect(sent.data).not.toHaveProperty(field);
    expect(host.textContent).toContain("已收到申請");
  });
  it("retains an incomplete old local draft without showing its hidden authorization progress", async () => {
    const draft = { ...legacy, email: "", inviteUrl: "https://manager." };
    localStorage.setItem(key, JSON.stringify({ data: draft }));
    await mount();
    assertSimplifiedForm();
    expect((host.querySelector('[name="storeName"]') as HTMLInputElement).value).toBe(data.storeName);
    expect(JSON.parse(localStorage.getItem(key)!).data).toEqual(draft);
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => root.unmount());
    root = createRoot(host);
    await mount();
    expect(JSON.parse(localStorage.getItem(key)!).data).toEqual(draft);
  });
  it("reads and supplements an old receipt without discarding historical values", async () => {
    history.replaceState(null, "", `/pricing/trial#application=${receipt.requestId}&token=${receipt.token}`);
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ...receipt, data: legacy }) });
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ id: receipt.id, revision: 3, status: receipt.status }) });
    await mount();
    assertSimplifiedForm();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).action).toBe("read");
    expect(host.textContent).toContain("設定中");
    await act(async () => {
      host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({ action: "save", requestId: receipt.requestId, revision: 2, data: legacy });
    expect(JSON.parse(localStorage.getItem(key)!).data).toEqual(legacy);
    expect(host.textContent).toContain("已收到申請");
  });
  it("preserves same-revision local edits when resuming an old receipt", async () => {
    const draft = { ...legacy, storeName: "尚未送出的修改" };
    localStorage.setItem(key, JSON.stringify({ data: draft, receipt }));
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ...receipt, data: legacy }) });
    await mount();
    expect((host.querySelector('[name="storeName"]') as HTMLInputElement).value).toBe(draft.storeName);
    expect(JSON.parse(localStorage.getItem(key)!).data).toEqual(draft);
  });
});
