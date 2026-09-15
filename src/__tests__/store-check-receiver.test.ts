import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync("scripts/store-check/Code.gs", "utf8");
function receiver(failMail = false, failSave = false) {
  const rows: unknown[][] = [Array(30).fill("")];
  const mail = vi.fn((message: unknown) => { void message; if (failMail) throw new Error("Mail quota"); });
  const range = (row: number, col: number, count = 1, width = 1): object => ({
    getValues: () => rows.slice(row - 1, row - 1 + count).map(r => r.slice(col - 1, col - 1 + width)),
    getValue: () => rows[row - 1]?.[col - 1],
    setValues: (values: unknown[][]) => values.forEach((r, i) => r.forEach((v, j) => { rows[row - 1 + i][col - 1 + j] = v; })),
    setValue: (value: unknown) => { rows[row - 1][col - 1] = value; },
    createTextFinder: (id: string) => ({ matchEntireCell: () => ({ findNext: () => {
      const index = rows.findIndex((r, i) => i > 0 && r[27] === id);
      return index < 0 ? null : { getRow: () => index + 1 };
    } }) }),
  });
  const sheet = { getMaxColumns: () => 30, getRange: range, getLastRow: () => rows.length,
    appendRow: (row: unknown[]) => { if (failSave) throw new Error("Write failed"); rows.push(row); } };
  const context = {
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => sheet }), flush: vi.fn() },
    MailApp: { sendEmail: mail }, console: { error: vi.fn() },
    LockService: { getScriptLock: () => ({ waitLock() {}, hasLock: () => true, releaseLock() {} }) },
    Utilities: { DigestAlgorithm: { SHA_256: "sha256" }, computeDigest: (algorithm: string, raw: string) => [...createHash(algorithm).update(raw).digest()] },
    ContentService: { MimeType: { JSON: "json" }, createTextOutput: (raw: string) => ({ setMimeType: () => JSON.parse(raw) }) },
  };
  const api = runInNewContext(source + "\n({doPost, buildNotification})", context);
  return { rows, mail, post: (data: object) => api.doPost({ postData: { contents: JSON.stringify(data) } }), notification: api.buildNotification };
}
const data = { requestId: "f2170225-17f8-4ad7-8031-f305afba256f", storeName: "測試店", contactName: "測試", industry: "服務", lineId: "TEST-DO-NOT-CONTACT", needs: ["預約"], contactWay: "申請體驗帳號" };
describe("prepared Apps Script receiver", () => {
  it("saves four fitness needs, priority and a no-contact status without personal details", () => {
    const r = receiver();
    const input = { ...data, formVersion: "fitness-v2", source: "fitness-intake", needs: ["1", "2", "3", "4"], priorityNeed: "3", contactWay: "目前暫不考慮" };
    expect(r.post(input)).toMatchObject({ saved: true });
    expect(r.rows[1][10]).toBe("1、2、3、4"); expect(r.rows[1][16]).toBe("不需聯繫");
    expect(r.rows[1][2]).toBe(""); expect(r.rows[1][14]).toBe(""); expect(r.rows[1][18]).toBe("");
    const mail = r.mail.mock.calls[0][0] as unknown as { subject: string; body: string; htmlBody: string };
    expect(mail.subject).toContain("不需聯絡"); expect(mail.body).toContain("最優先改善：3");
    expect(mail.htmlBody).toContain("請勿主動聯繫");
  });
  it("rejects five fitness needs and keeps legacy contact/three-need limits", () => {
    const r = receiver();
    for (const input of [
      { ...data, formVersion: "fitness-v2", source: "fitness-intake", needs: ["1", "2", "3", "4", "5"], priorityNeed: "1" },
      { ...data, needs: ["1", "2", "3", "4"] },
      { ...data, contactWay: "目前暫不考慮", contactName: "", lineId: "" },
    ]) expect(r.post(input)).toMatchObject({ saved: false });
    expect(r.rows).toHaveLength(1); expect(r.mail).not.toHaveBeenCalled();
  });
  it("saves one row and sends one notification for identical repeated requests", () => {
    const r = receiver();
    expect(r.post(data)).toMatchObject({ saved: true, requestId: data.requestId, notification: "sent" });
    expect(r.post(data)).toMatchObject({ saved: true });
    expect(r.rows).toHaveLength(2); expect(r.mail).toHaveBeenCalledTimes(1);
    expect(r.rows[1][12]).toBe("申請體驗帳號"); expect(r.rows[1][28]).toBe("已寄送");
  });
  it("retains a saved row and reports mail failure separately", () => {
    const r = receiver(true);
    expect(r.post(data)).toMatchObject({ ok: true, saved: true, notification: "failed" });
    expect(r.rows[1][28]).toBe("寄送失敗，請人工確認");
  });
  it("never acknowledges failed persistence or sends mail for it", () => {
    const r = receiver(false, true);
    expect(r.post(data)).toMatchObject({ ok: false, saved: false }); expect(r.mail).not.toHaveBeenCalled();
  });
  it("rejects conflicting payloads reusing a saved ID", () => {
    const r = receiver(); r.post(data);
    expect(r.post({ ...data, storeName: "不同店家" })).toMatchObject({ ok: false, saved: false });
    expect(r.rows).toHaveLength(2);
  });
  it("escapes user HTML and uses trial-specific subject, stacked fields and a fixed recipient", () => {
    const r = receiver();
    const n = r.notification({ ...data, storeName: '<img src=x onerror="bad">' });
    expect(n.subject).toContain("一般店家體驗申請｜");
    expect(n.body).toContain("#gid=2026091501");
    expect(n.htmlBody).toContain("&lt;img"); expect(n.htmlBody).not.toContain("<img");
    expect(n.htmlBody.indexOf("LINE ID")).toBeLessThan(n.htmlBody.indexOf("主要需求"));
    r.post({ ...data, to: "untrusted@example.com" });
    expect(r.mail.mock.calls[0]).toEqual([expect.objectContaining({ to: "rock7652@gmail.com" })]);
  });
  it("routes course enquiries to their own subject and tab regardless of trial choice", () => {
    const r = receiver();
    for (const contactWay of ["申請體驗帳號", "先透過 LINE 了解", "目前暫不考慮"]) {
      const n = r.notification({ ...data, source: "fitness-intake", contactWay });
      expect(n.subject).toContain("課程教室需求與體驗｜");
      expect(n.body).toContain("#gid=2026091502");
      expect(n.htmlBody).toContain("#gid=2026091502");
    }
    const legacy = r.notification({ ...data, contactWay: "先透過 LINE 了解" });
    expect(legacy.subject).toContain("新的門市健檢｜");
    expect(legacy.body).toContain("#gid=1690370556");
  });
});
