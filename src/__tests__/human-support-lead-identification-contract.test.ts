import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const handoff = readFileSync("src/server/services/human-support-handoff.ts", "utf8");
const query = readFileSync("src/server/queries/digital-butler-leads.ts", "utf8");
const list = readFileSync("src/app/(dashboard)/dashboard/digital-butler/leads/lead-list.tsx", "utf8");

describe("human-support lead identification safety contract", () => {
  it("stores only a bounded encrypted message preview and a non-identifying fallback", () => {
    expect(handoff).toContain("slice(0, 160)");
    expect(handoff).toContain("encryptDigitalButlerValue(lastMessage)");
    expect(handoff).toContain("客服-${senderIdHash.slice(0, 8)}");
    expect(handoff).not.toContain("customerSenderId");
  });

  it("allows only LINE's verified HTTPS avatar host", () => {
    expect(handoff).toContain('url.protocol === "https:"');
    expect(handoff).toContain('url.hostname === "profile.line-scdn.net"');
  });

  it("treats LINE profile errors and blank names as unavailable enrichment", () => {
    expect(handoff).toContain("profile.error");
    expect(handoff).toContain("!profile.displayName.trim()");
  });

  it("decrypts the preview only in the authorized store-scoped query", () => {
    expect(query).toContain("requireDigitalButlerEntitlement(storeId)");
    expect(query).toContain("decryptDigitalButlerValue");
    expect(query).not.toContain("senderIdCiphertext");
  });

  it("keeps the ordinary lead phone as the final identification fallback", () => {
    expect(list).toContain(
      'lead.customerDisplayName ?? lead.customerReference ?? lead.phone ?? "未辨識顧客"',
    );
  });

  it("does not claim a per-customer LINE or Messenger deep link", () => {
    expect(list).toContain("前往 LINE 官方帳號");
    expect(list).toContain("前往 Messenger 收件匣");
    expect(list).not.toContain("查看對話");
  });
});
