import { describe, expect, it } from "vitest";
import {
  CONSULTATION_LEAD_STATUSES,
  consultationLeadStatusSchema,
  isConsultationNoContact,
  isSafeConsultationUrl,
  payloadSchema,
  sanitizeConsultationPayload,
} from "./consultation-lead";

const legacy = {
  requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  storeName: " Synthetic studio ",
  contactName: " Synthetic contact ",
  industry: "一般店家",
  lineId: "synthetic-line",
  needs: ["預約管理"],
  replaceReason: [],
};
const fitness = {
  ...legacy,
  formVersion: "fitness-v2",
  source: "fitness-intake",
  industry: "運動教室／健身／瑜伽",
  contactWay: "申請體驗帳號",
  priorityNeed: "預約管理",
};

describe("consultation payload: existing two-stage contract", () => {
  it("retains trimming, LINE-only contact, optional fields, and unknown-key stripping", () => {
    const payload = payloadSchema.parse({ ...legacy, email: "unused@example.com", unrelated: true });
    expect(payload.storeName).toBe("Synthetic studio");
    expect(payload.contactName).toBe("Synthetic contact");
    expect(payload.phone).toBeUndefined();
    expect(payload).not.toHaveProperty("email");
    expect(payload).not.toHaveProperty("unrelated");
    expect(payload).not.toHaveProperty("websiteUrl");
  });

  it("accepts phone-only and still requires name plus phone OR LINE", () => {
    expect(payloadSchema.safeParse({ ...legacy, lineId: "", phone: "synthetic-phone" }).success).toBe(true);
    expect(payloadSchema.safeParse({ ...legacy, lineId: "", phone: "" }).success).toBe(false);
    expect(payloadSchema.safeParse({ ...legacy, contactName: " " }).success).toBe(false);
    expect(payloadSchema.safeParse({ ...legacy, requestId: "not-a-uuid" }).success).toBe(false);
  });

  it("retains legacy needs count, duplicate and course-industry rules", () => {
    expect(payloadSchema.safeParse({ ...legacy, needs: ["a", "b", "c", "d"] }).success).toBe(false);
    expect(payloadSchema.safeParse({ ...legacy, needs: ["a", "a"] }).success).toBe(false);
    expect(payloadSchema.safeParse({ ...legacy, courseFormat: "個別課" }).success).toBe(false);
    expect(payloadSchema.safeParse({ ...fitness, courseFormat: "個別課" }).success).toBe(true);
  });

  it("retains fitness source, intent, priority and unknown-need rules", () => {
    expect(payloadSchema.safeParse(fitness).success).toBe(true);
    expect(payloadSchema.safeParse({ ...fitness, source: "elsewhere" }).success).toBe(false);
    expect(payloadSchema.safeParse({ ...fitness, contactWay: "invalid" }).success).toBe(false);
    expect(payloadSchema.safeParse({ ...fitness, priorityNeed: "missing" }).success).toBe(false);
    expect(payloadSchema.safeParse({ ...fitness, needs: ["a", "b", "c", "d", "e"], priorityNeed: "a" }).success).toBe(true);
    expect(payloadSchema.safeParse({ ...fitness, needs: ["還不確定，想先聊聊"], priorityNeed: "" }).success).toBe(true);
    expect(payloadSchema.safeParse({ ...fitness, needs: ["還不確定，想先聊聊", "a"], priorityNeed: "" }).success).toBe(false);
  });

  it("erases opt-out contact fields without mutating caller input", () => {
    const input = payloadSchema.parse({ ...fitness, contactWay: "目前暫不考慮", phone: "synthetic-phone", time: "synthetic-time" });
    const sanitized = sanitizeConsultationPayload(input);
    expect(isConsultationNoContact(input)).toBe(true);
    expect(sanitized).toMatchObject({ contactName: "", phone: "", lineId: "", time: "" });
    expect(input.contactName).toBe("Synthetic contact");
    expect(input.lineId).toBe("synthetic-line");
    expect(payloadSchema.safeParse({ ...fitness, contactWay: "目前暫不考慮", contactName: "", lineId: "" }).success).toBe(true);
    expect(isConsultationNoContact({ ...legacy, contactWay: "目前暫不考慮" })).toBe(false);
    expect(sanitizeConsultationPayload(payloadSchema.parse(legacy)).contactName).toBe("Synthetic contact");
  });

  it("defines the HQ-only status labels separately from TrialApplication statuses", () => {
    expect(CONSULTATION_LEAD_STATUSES).toEqual({ NEW: "待聯繫", CONTACTED: "已聯繫", FOLLOW_UP: "追蹤中", CLOSED: "已結案" });
    expect(consultationLeadStatusSchema.safeParse("RECEIVED").success).toBe(false);
  });
});

describe("optional store links", () => {
  it("retains the original provided URL and never reuses pageUrl", () => {
    const payload = payloadSchema.parse({ ...legacy, websiteUrl: " https://studio.example.com/about?from=site#team ", facebookUrl: "https://www.facebook.com/synthetic", instagramUrl: "https://instagram.com/synthetic", pageUrl: "https://intake.example.com/apply" });
    expect(payload.websiteUrl).toBe("https://studio.example.com/about?from=site#team");
    expect(payload.pageUrl).toBe("https://intake.example.com/apply");
    expect(payloadSchema.parse({ ...legacy, pageUrl: "https://intake.example.com/apply" }).websiteUrl).toBeUndefined();
    expect(payloadSchema.safeParse({ ...legacy, websiteUrl: "", facebookUrl: "", instagramUrl: "" }).success).toBe(true);
  });

  it.each([
    "http://example.com", "javascript:alert(1)", "data:text/html,hello", "//example.com",
    "https://user:pass@example.com", "https://user@example.com", "https://example.com:8443",
    "https://localhost", "https://sub.localhost", "https://host.local", "https://host.internal",
    "https://router.lan", "https://server.home", "https://printer", "https://127.0.0.1",
    "https://10.0.0.1", "https://172.16.0.1", "https://192.168.1.1", "https://169.254.169.254",
    "https://0x7f000001", "https://2130706433", "https://127.1", "https://[::1]",
    "https://[fd00::1]", "https://[::ffff:127.0.0.1]", "https://exa mple.com",
    "https://example.com/\npath", "https://example.com\\path", "https://example.com\u0000",
  ])("rejects unsafe/local URL %s", (url) => {
    expect(isSafeConsultationUrl(url)).toBe(false);
    expect(payloadSchema.safeParse({ ...legacy, websiteUrl: url }).success).toBe(false);
  });

  it.each([
    ["facebookUrl", "https://facebook.com.evil.example/synthetic"],
    ["facebookUrl", "https://notfacebook.com/synthetic"],
    ["facebookUrl", "https://l.facebook.com/l.php?u=https://example.com"],
    ["instagramUrl", "https://instagram.com.evil.example/synthetic"],
    ["instagramUrl", "https://facebook.com/synthetic"],
  ])("restricts %s to official supported hostnames", (field, url) => {
    expect(payloadSchema.safeParse({ ...legacy, [field]: url }).success).toBe(false);
  });
});
