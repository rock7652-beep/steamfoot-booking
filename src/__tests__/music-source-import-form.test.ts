// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OpeningImportForm } from "@/app/(dashboard)/dashboard/courses/opening-import/import-form";
const actions = vi.hoisted(() => ({ submit: vi.fn(), export: vi.fn() }));
vi.mock("@/server/actions/music-source-import", () => ({ submitMusicSourceImport: actions.submit, exportMusicSourceBatch: actions.export }));
afterEach(() => { vi.clearAllMocks(); document.body.innerHTML = ""; vi.unstubAllGlobals(); });
describe("source file survives native form resets", () => {
  it("confirmation sends the same File after React resets the file input", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const preview = { status: "PREVIEW", fileVersion: 1, message: "預覽完成", contentHash: "a", planHash: "b",
      preview: { sourceDate: "2026-10-14", counts: { students: 1, tuition: 0, attendance: 0, schedule: 0 }, create: 1, existing: 0, review: 0, rows: [], limitations: [] },
    };
    actions.submit.mockResolvedValueOnce(preview).mockResolvedValueOnce({ status: "HOLD", message: "營業時段不寫入" }).mockResolvedValue(preview);
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    await act(async () => { root.render(createElement(OpeningImportForm)); });
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File(['{"synthetic":true}'], "synthetic.json", { type: "application/json" });
    Object.defineProperty(input, "files", { configurable: true, value: [file] });
    await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); });
    await act(async () => { host.querySelector<HTMLButtonElement>('button[value="preview"]')!.click(); });
    // Model the browser's native form reset: the original input is now empty.
    Object.defineProperty(input, "files", { configurable: true, value: [] }); input.value = "";
    expect(input.required).toBe(false);
    expect(host.textContent).toContain("已選擇：synthetic.json");
    await act(async () => { host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(); });
    await act(async () => { host.querySelector<HTMLButtonElement>('button[value="commit"]')!.click(); });
    expect(actions.submit).toHaveBeenCalledTimes(2);
    const first = actions.submit.mock.calls[0][1].get("manifest") as File;
    const second = actions.submit.mock.calls[1][1].get("manifest") as File;
    expect(second.name).toBe(file.name); expect(second.size).toBe(first.size); expect(second.size).toBe(file.size);
    expect(actions.submit.mock.calls[1][1].get("intent")).toBe("commit");
    await act(async () => { host.querySelector<HTMLButtonElement>('button[value="preview"]')!.click(); });
    expect(host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(false);
    expect(host.querySelector<HTMLButtonElement>('button[value="commit"]')!.disabled).toBe(true);
    await act(async () => root.unmount());
  });
});
