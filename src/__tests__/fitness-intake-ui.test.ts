import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";

const { JSDOM } = createRequire(import.meta.url)("jsdom");
const html = readFileSync("public/pricing/fitness.html", "utf8");
const source = readFileSync("public/pricing/fitness.js", "utf8");
const closes: (() => void)[] = [];
afterEach(() => { closes.splice(0).forEach(close => close()); });
function setup(saved?: object) {
  const dom = new JSDOM(html, { url: "https://www.steamfoot.com/pricing/fitness.html", runScripts: "outside-only" });
  const w = dom.window;
  closes.push(() => w.close());
  w.HTMLElement.prototype.scrollIntoView = vi.fn();
  w.AbortSignal.timeout = () => undefined;
  const sent: Record<string, unknown>[] = [];
  const fetch = vi.fn(async (_url: string, init: {body: string}) => {
    const body = JSON.parse(init.body); sent.push(body);
    return { ok: true, status: 200, json: async () => ({ ok: true, saved: true, requestId: body.requestId }) };
  });
  w.fetch = fetch;
  if (saved) w.sessionStorage.setItem("steam-butler-fitness-intake-v2", JSON.stringify(saved));
  w.eval(source);
  const doc = w.document as Document;
  const input = (name: string) => doc.querySelector<HTMLInputElement>('[name="' + name + '"]')!;
  const check = (name: string, value: string) => {
    const element = [...doc.querySelectorAll<HTMLInputElement>('[name="' + name + '"]')].find(i => i.value === value)!;
    element.click(); return element;
  };
  const fill = (name: string, value: string) => { input(name).value = value; input(name).dispatchEvent(new w.Event("input", {bubbles: true})); };
  const select = (value: string) => { input("contactWay").value = value; input("contactWay").dispatchEvent(new w.Event("change", {bubbles: true})); };
  const next = () => doc.querySelector<HTMLButtonElement>('section:not([hidden]) [data-next]')!.click();
  const back = () => doc.querySelector<HTMLButtonElement>('section:not([hidden]) [data-back]')!.click();
  const submit = async () => { doc.querySelector<HTMLButtonElement>('#submitBtn')!.click(); await new Promise(resolve => setTimeout(resolve, 0)); };
  const needs = [...doc.querySelectorAll<HTMLInputElement>('[name="needs"]')].map(i => i.value);
  const active = () => doc.querySelector<HTMLElement>('section[data-step]:not([hidden])')!.dataset.step;
  return { doc, w, sent, fetch, input, check, fill, select, next, back, submit, needs, active };
}
function reachContact(r: ReturnType<typeof setup>) {
  r.fill("storeName", "TEST 教室"); r.check("needs", r.needs[0]); r.next();
  r.fill("storeCount", "1 家");
  r.check("classModes", "尚未確定"); r.check("management", "尚未確定"); r.next();
}
describe("fitness intake three-step DOM interactions (not a visual browser test)", () => {
  it("submits every concrete need, including the five customer relationship choices", async () => {
    const r = setup(); r.fill("storeName", "TEST");
    const choices = r.needs.filter(value => value !== "還不確定，想先聊聊");
    for (const value of choices) r.check("needs", value);
    for (const name of ["studentOther", "coachOther", "operationsOther", "businessOther"]) r.fill(name, "測試補充");
    const relationship = ["學員很久沒來，常常沒有及時發現", "方案快到期、堂數快用完，容易漏掉提醒與關心", "體驗後的回訪與關心，常常漏掉跟進", "經營數據要花大把時間自己整理", "其他學員關係或經營分析困擾"];
    const group = [...r.doc.querySelectorAll('.pain-group')].find(el => el.querySelector('h3')!.textContent === "顧客關係維護")!;
    expect([...group.querySelectorAll<HTMLInputElement>('[name="needs"]')].map(i => i.value)).toEqual(relationship);
    expect(r.doc.getElementById('needs')!.textContent).not.toMatch(/招生|續報/);
    expect(r.doc.getElementById('needsWhy')!.textContent).not.toContain('最多');
    expect(r.doc.getElementById('needsStatus')!.textContent).toBe('已選 ' + choices.length + ' 項');
    r.check('priorityNeed', relationship[3]); r.next(); r.fill('storeCount', '1 家');
    r.check('classModes', '尚未確定'); r.check('management', '尚未確定'); r.next(); r.select('目前暫不考慮'); await r.submit();
    expect(r.sent[0]).toMatchObject({ needs: choices, priorityNeed: relationship[3] });
  });
  it.each(["籌備中，尚未開店", "1 家", "2～3 家", "4 家以上"])("requires and preserves the selected store count: %s", async count => {
    const r = setup(); r.fill("storeName", "TEST");
    const migration = "想換系統，但擔心學員資料、剩餘堂數和預約不好搬過來";
    const multiStore = "各店資料分散，想看整體狀況得分別查詢或整理";
    r.check("needs", migration); r.check("needs", multiStore); r.check("priorityNeed", multiStore); r.next();
    r.check("classModes", "尚未確定"); r.check("management", "尚未確定"); r.next();
    expect(r.active()).toBe("1"); expect(r.doc.getElementById("error")!.textContent).toContain("據點數");
    r.fill("storeCount", count); r.next(); r.select("目前暫不考慮"); await r.submit();
    expect(r.sent[0]).toMatchObject({ storeCount: count, needs: [migration, multiStore], priorityNeed: multiStore });
    expect(r.doc.getElementById("courseTypes")).toBeNull();
  });
  it("allows more than four choices and clears a removed priority", () => {
    const r = setup();
    for (const index of [0, 1, 4, 8]) r.check("needs", r.needs[index]);
    r.check("priorityNeed", r.needs[0]);
    expect(r.check("needs", r.needs[12]).checked).toBe(true);
    expect(r.doc.querySelectorAll('[name="needs"]:checked')).toHaveLength(5);
    expect(r.doc.getElementById("needsStatus")!.textContent).toBe("已選 5 項");
    r.check("needs", r.needs[0]);
    expect(r.doc.querySelector('[name="priorityNeed"]:checked')).toBeNull();
  });
  it("shows each category's other input only when checked and requires a description", () => {
    const r = setup(); r.fill("storeName", "TEST");
    r.check("needs", "其他學員相關困擾");
    expect(r.input("studentOther").disabled).toBe(false);
    r.next(); expect(r.active()).toBe("0");
    r.fill("studentOther", "學生想替家人預約"); r.next(); expect(r.active()).toBe("1");
    r.back(); r.check("needs", "其他學員相關困擾");
    expect(r.input("studentOther").disabled).toBe(true);
    expect(r.input("studentOther").value).toBe("學生想替家人預約");
  });
  it("makes undecided exclusive and auto-skips priority for one need", () => {
    const r = setup(); r.fill("storeName", "TEST");
    r.check("needs", r.needs[0]); r.check("needs", "還不確定，想先聊聊");
    expect(r.doc.querySelectorAll('[name="needs"]:checked')).toHaveLength(1);
    expect(r.doc.getElementById("priorityField")!.hidden).toBe(true);
    r.next(); expect(r.active()).toBe("1");
    r.check("classModes", "尚未確定"); r.check("classModes", "團課，每堂自由預約");
    expect(r.doc.querySelectorAll('[name="classModes"]:checked')).toHaveLength(1);
  });
  it("preserves answers on back navigation and restores step/priority from a draft", () => {
    const r = setup(); r.fill("storeName", "TEST");
    r.check("needs", r.needs[0]); r.check("needs", r.needs[4]); r.check("priorityNeed", r.needs[4]); r.next();
    r.fill("storeCount", "2～3 家"); r.back(); r.next();
    const stored = JSON.parse(r.w.sessionStorage.getItem("steam-butler-fitness-intake-v2"));
    const restored = setup(stored);
    expect(restored.active()).toBe("1");
    expect(restored.doc.querySelector<HTMLInputElement>('[name="priorityNeed"]:checked')!.value).toBe(r.needs[4]);
    expect(restored.input("storeCount").value).toBe("2～3 家");
  });
  it("requires contact for trial but clears and omits it after opting out", async () => {
    const r = setup(); reachContact(r); r.select("申請體驗帳號");
    await r.submit(); expect(r.fetch).not.toHaveBeenCalled();
    r.fill("contactName", "TEST"); r.fill("lineId", "TEST-NO-CONTACT");
    r.select("目前暫不考慮");
    expect(r.input("contactName").value).toBe(""); expect(r.input("lineId").disabled).toBe(true);
    await r.submit(); expect(r.sent).toHaveLength(1);
    expect(r.sent[0]).toMatchObject({ contactName: "", lineId: "", phone: "", priorityNeed: r.needs[0], formVersion: "fitness-v2" });
    expect(r.doc.getElementById("success")!.hidden).toBe(false);
  });
  it("serializes all four categories, store count and selected Other text without hidden stale text", async () => {
    const r = setup(); r.fill("storeName", "TEST");
    for (const value of ["其他學員相關困擾", "其他教練相關困擾", "其他店務相關困擾", "其他學員關係或經營分析困擾"]) r.check("needs", value);
    for (const name of ["studentOther", "coachOther", "operationsOther", "businessOther"]) r.fill(name, name + " 測試內容");
    r.check("priorityNeed", "其他教練相關困擾"); r.next();
    r.fill("storeCount", "4 家以上");
    r.check("management", "其他方式"); r.fill("managementOther", "不應送出的舊方式"); r.check("management", "其他方式");
    r.check("classModes", "其他上課方式"); r.fill("classModesOther", "預約包班");
    r.check("management", "管理系統"); r.fill("systemName", "TEST 系統"); r.next(); r.select("目前暫不考慮"); await r.submit();
    expect(r.sent).toHaveLength(1); expect(r.sent[0].needs).toHaveLength(4);
    expect(r.sent[0].otherNeed).toContain("最優先改善：其他教練相關困擾");
    expect(r.sent[0].otherNeed).toContain("businessOther 測試內容");
    expect(r.sent[0].storeCount).toBe("4 家以上");
    expect(r.sent[0].otherNeed).toContain("空間與分店補充：據點數：4 家以上");
    expect(r.sent[0].otherNeed).not.toContain("不應送出");
  });
  it("blocks repeated submission while uncertain, including after reload", async () => {
    const r = setup(); reachContact(r); r.select("目前暫不考慮"); r.fetch.mockRejectedValueOnce(new Error("timeout"));
    await r.submit(); await r.submit(); expect(r.fetch).toHaveBeenCalledTimes(1);
    const restored = setup(JSON.parse(r.w.sessionStorage.getItem("steam-butler-fitness-intake-v2")));
    expect(restored.doc.querySelector<HTMLButtonElement>('#submitBtn')!.disabled).toBe(true);
    expect(restored.doc.getElementById("error")!.textContent).toContain("不要重複送出");
  });
  it("keeps the draft retryable if the receiver has not been upgraded", async () => {
    const r = setup(); reachContact(r); r.select("目前暫不考慮");
    r.fetch.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({code: "RECEIVER_UPDATE_REQUIRED"}) } as never);
    await r.submit();
    expect(r.doc.querySelector<HTMLButtonElement>('#submitBtn')!.disabled).toBe(false);
    expect(r.doc.getElementById("error")!.textContent).toContain("尚未送出");
    expect(JSON.parse(r.w.sessionStorage.getItem("steam-butler-fitness-intake-v2")).state).toBe("draft");
  });
});
