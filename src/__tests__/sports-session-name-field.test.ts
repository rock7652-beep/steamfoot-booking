// @vitest-environment jsdom
import { act, createElement, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SportsSessionNameField } from "@/app/(dashboard)/dashboard/courses/sports-session-name-field";

let root: Root, host: HTMLDivElement;
const defaults = { defaultName: "瑜珈", originalTemplateName: "瑜珈", templateName: "瑜珈" };
async function render(props: ComponentProps<typeof SportsSessionNameField> = defaults) {
  await act(async () => root.render(createElement("form", null, createElement(SportsSessionNameField, props))));
}
function submittedName() { return new FormData(host.querySelector("form")!).get("name"); }
async function changeName(value: string) {
  const input = host.querySelector<HTMLInputElement>('[name="customName"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

it("keeps the optional field collapsed and submits the selected teaching item's name", async () => {
  await render();
  expect(host.querySelector("details")!.open).toBe(false);
  expect(host.querySelector<HTMLInputElement>('[name="customName"]')!.required).toBe(false);
  expect(submittedName()).toBe("瑜珈");
  await render({ ...defaults, templateName: "皮拉提斯" });
  expect(submittedName()).toBe("皮拉提斯");
});
it("retains an existing custom name through item changes and rerenders", async () => {
  await render({ ...defaults, defaultName: "週二晚間班" });
  expect(host.querySelector("summary")!.textContent).toContain("週二晚間班");
  expect(submittedName()).toBe("週二晚間班");
  const input = host.querySelector('[name="customName"]');
  await render({ ...defaults, defaultName: "週二晚間班", templateName: "皮拉提斯" });
  expect(host.querySelector('[name="customName"]')).toBe(input);
  expect(submittedName()).toBe("週二晚間班");
});
it("lets a user customize the name and clear it to restore the current item name", async () => {
  await render();
  await changeName("  晚間伸展班  ");
  expect(submittedName()).toBe("晚間伸展班");
  await render({ ...defaults, templateName: "皮拉提斯" });
  expect(submittedName()).toBe("晚間伸展班");
  await changeName("   ");
  expect(submittedName()).toBe("皮拉提斯");
  expect(host.querySelector("summary")!.textContent).toContain("自訂課名（選填）");
});
