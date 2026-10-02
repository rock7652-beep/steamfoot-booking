import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";

const { JSDOM } = createRequire(import.meta.url)("jsdom");
const closes: (() => void)[] = [];
afterEach(() => closes.splice(0).forEach(close => close()));
function setup(query = "") {
  const dom = new JSDOM(readFileSync("public/pricing/apply.html", "utf8"), {
    url: "https://www.steamfoot.com/apply" + query, runScripts: "outside-only",
  });
  const w = dom.window;
  closes.push(() => w.close());
  w.scrollTo = vi.fn();
  w.alert = vi.fn();
  w.AbortSignal.timeout = () => undefined;
  const fetch = vi.fn(async (_url: string, init: { body: string }) => ({
    ok: true, status: 200, json: async () => ({ ok: true, saved: true, requestId: JSON.parse(init.body).requestId }),
  }));
  w.fetch = fetch;
  w.eval(w.document.querySelector("script").textContent);
  const doc = w.document as Document;
  const fill = (name: string, value: string) => {
    const field = doc.querySelector<HTMLInputElement | HTMLSelectElement>('[name="' + name + '"]')!;
    field.value = value;
    field.dispatchEvent(new w.Event("change", { bubbles: true }));
  };
  return { doc, fill, fetch };
}
describe("store needs form interactions", () => {
  it("keeps the needs form and next step editable for trial links", () => {
    const { doc, fill } = setup("?intent=trial&utm_source=website");
    expect(doc.getElementById("entryTitle")!.textContent).toBe("讓蒸管家先認識你的店");
    expect(doc.getElementById("contactWayField")!.hidden).toBe(false);
    fill("contactWay", "先透過 LINE 了解");
    expect(doc.getElementById("entryTitle")!.textContent).toBe("讓蒸管家先認識你的店");
  });
  it("reveals classroom questions and drops hidden answers after switching industries", async () => {
    const r = setup();
    const course = r.doc.querySelector<HTMLSelectElement>('[name="courseFormat"]')!;
    expect(course.disabled).toBe(true);
    r.fill("industry", "音樂／才藝／教育服務");
    expect(r.doc.getElementById("courseFormatField")!.hidden).toBe(false);
    r.fill("courseFormat", "兩者都有");
    r.fill("industry", "運動教室／健身／瑜伽");
    expect(course.value).toBe("兩者都有");
    r.fill("industry", "美容／美體／SPA");
    expect(course.disabled).toBe(true);
    expect(course.value).toBe("");
    expect(r.doc.getElementById("courseFormatField")!.hidden).toBe(true);
    for (const [name, value] of Object.entries({ storeName: "TEST 勿聯絡", contactName: "測試", staffCount: "只有我", storeCount: "籌備中，尚未開店", bookingMode: "不確定，希望協助判斷", phone: "TEST", contactWay: "希望電話聯繫" })) r.fill(name, value);
    r.doc.querySelector<HTMLInputElement>('[name="needs"]')!.click();
    r.doc.querySelector<HTMLButtonElement>("#submitBtn")!.click();
    await vi.waitFor(() => expect(r.fetch).toHaveBeenCalledTimes(1));
    const data = JSON.parse(r.fetch.mock.calls[0][1].body);
    expect(data).not.toHaveProperty("courseFormat");
    expect(data.storeCount).toBe("籌備中，尚未開店");
    await vi.waitFor(() => expect(r.doc.getElementById("successView")!.classList.contains("show")).toBe(true));
    expect(r.doc.getElementById("successView")!.textContent).toContain("依您留下的聯絡方式");
  });
});
