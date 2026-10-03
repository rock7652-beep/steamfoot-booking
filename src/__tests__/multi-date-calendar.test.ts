// @vitest-environment jsdom
import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { MultiDateCalendar } from "@/components/admin/multi-date-calendar";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it("selects and removes dates across months while preserving the starting day", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  function Form() {
    const [dates, setDates] = useState<string[]>([]);
    return createElement("form", null, createElement(MultiDateCalendar, {baseDate:"2026-10-31",initialMonth:"2026-10-31",dates,onChange:setDates}), dates.map(date => createElement("input",{key:date,type:"hidden",name:"additionalDates",value:date})));
  }
  try {
    await act(async () => root.render(createElement(Form)));
    const button = (label: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
    expect(button("2026-10-31").disabled).toBe(true);
    await act(async () => button("2026-10-30").click());
    await act(async () => button("下個月").click());
    await act(async () => button("2026-11-02").click());
    expect(new FormData(host.querySelector("form")!).getAll("additionalDates")).toEqual(["2026-10-30", "2026-11-02"]);
    expect(host.textContent).toContain("已選 3 天");
    await act(async () => button("2026-11-02").click());
    await act(async () => button("上個月").click());
    expect(button("2026-10-30").getAttribute("aria-pressed")).toBe("true");
    await act(async () => [...host.querySelectorAll("button")].find(b => b.textContent === "清除其他日期")!.click());
    expect(new FormData(host.querySelector("form")!).getAll("additionalDates")).toEqual([]);
    expect(button("2026-10-31").getAttribute("aria-pressed")).toBe("true");
  } finally { await act(async () => root.unmount()); host.remove(); }
});

it("allows removing an existing choice at the batch limit and blocks empty starting dates", async () => {
  const host = document.createElement("div");
  const root = createRoot(host);
  const dates = ["2026-10-02", ...Array.from({ length: 51 }, (_, i) => `2027-${String(Math.floor(i / 28) + 1).padStart(2, "0")}-${String(i % 28 + 1).padStart(2, "0")}`)];
  try {
    await act(async () => root.render(createElement(MultiDateCalendar,{baseDate:"2026-10-01",initialMonth:"2026-10-01",dates,onChange:()=>{}})));
    expect(host.querySelector<HTMLButtonElement>('button[aria-label="2026-10-02"]')!.disabled).toBe(false);
    expect(host.querySelector<HTMLButtonElement>('button[aria-label="2026-10-03"]')!.disabled).toBe(true);
    await act(async () => root.render(createElement(MultiDateCalendar,{baseDate:"",initialMonth:"2026-10-01",dates:[],onChange:()=>{}})));
    expect(host.textContent).toContain("請先選擇起始日期");
    expect(host.querySelector<HTMLButtonElement>('button[aria-label="2026-10-03"]')!.disabled).toBe(true);
  } finally { await act(async () => root.unmount()); }
});
