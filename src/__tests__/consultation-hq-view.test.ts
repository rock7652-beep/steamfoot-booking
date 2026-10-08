import { describe, expect, it } from "vitest";
import { consultationHref, parseConsultationSearch, suppliedLineHref, suppliedPhoneHref, suppliedWebHref, suppliedEmailHref } from "@/app/hq/dashboard/trial-applications/consultation-view";
describe("consultation HQ search and safe original contacts", () => {
  it("keeps existing formal application notification deep links on their original stage", () => {
    expect(parseConsultationSearch({ application: "exact-id" })).toMatchObject({ stage: "applications", application: "exact-id" });
    expect(parseConsultationSearch({ stage: "consultations", application: "exact-id" })).toMatchObject({ stage: "consultations", application: "exact-id" });
  });
  it.each(["NaN", "-1", "0", "", "Infinity"])("bounds invalid pagination (%s)", page => {
    const search = parseConsultationSearch({ page, activityPage: page });
    expect(search.page).toBeGreaterThanOrEqual(1); expect(search.page).toBeLessThanOrEqual(10000);
    expect(search.activityPage).toBe(search.page);
  });
  it("bounds search and ignores array and prototype-key filters", () => {
    expect(parseConsultationSearch({ q: "x".repeat(1000), status: "toString", page: "999999" })).toMatchObject({ q: "x".repeat(200), status: undefined, page: 10000 });
    expect(parseConsultationSearch({ q: ["a", "b"], status: ["NEW"] })).toMatchObject({ q: "", status: undefined });
    expect(parseConsultationSearch({ stage: "applications", status: "NEW" }).status).toBeUndefined();
  });
  it("encodes search terms into links rather than interpreting them", () => {
    const link = consultationHref({ stage: "consultations", q: "a&status=CLOSED#top", page: 2 });
    const url = new URL(link, "https://example.com"); expect(url.searchParams.get("q")).toBe("a&status=CLOSED#top"); expect(url.hash).toBe("");
  });
  it("uses only a valid supplied phone number for tel links", () => {
    expect(suppliedPhoneHref("+886 (912) 345-678")).toBe("tel:+886912345678");
    expect(suppliedPhoneHref("02-1234-5678")).toBe("tel:0212345678");
  });
  it.each(["TEST 勿聯絡", "12345", "tel:0912345678", "0912345678?body=hello", "0912345678;123", "0912345678\njavascript:alert(1)"])("does not turn arbitrary phone text into a contact action (%s)", value => expect(suppliedPhoneHref(value)).toBeNull());
  it("makes a mailto from only a supplied valid email, without headers or message body", () => {
    expect(suppliedEmailHref("store+intake@example.com")).toBe("mailto:store%2Bintake%40example.com");
    expect(suppliedEmailHref("store@example.com?bcc=other@example.com")).toBeNull();
    expect(suppliedEmailHref("store@example.com\r\nBcc:other@example.com")).toBeNull();
    expect(suppliedEmailHref("\nstore@example.com")).toBeNull();
    expect(suppliedEmailHref("LINE 顯示名稱")).toBeNull();
  });
  it("never manufactures LINE links from ids or display names", () => {
    expect(suppliedLineHref("@example")).toBeNull(); expect(suppliedLineHref("某店 LINE 顯示名稱")).toBeNull();
    expect(suppliedLineHref("https://line.me/R/ti/p/@example")).toBe("https://line.me/R/ti/p/@example");
    expect(suppliedLineHref("https://lin.ee/provided")).toBe("https://lin.ee/provided");
  });
  it.each(["javascript:alert(1)", "http://example.com", "https://line.me.evil.example/x", "https://user:password@line.me/x", "https://line.me:444/x", "https://127.0.0.1/x", "https://localhost/x"])("rejects unsafe or unverified LINE links (%s)", value => expect(suppliedLineHref(value)).toBeNull());
  it("preserves supplied public HTTPS links exactly rather than guessing", () => {
    expect(suppliedWebHref(" https://example.com ")).toBe("https://example.com");
    expect(suppliedWebHref("https://example.com/path?q=provided")).toBe("https://example.com/path?q=provided");
    expect(suppliedWebHref("example.com")).toBeNull(); expect(suppliedWebHref("https://example.internal/path")).toBeNull();
  });
});
